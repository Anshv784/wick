//! Dual-oracle reads. Every settlement and touch confirmation needs a Pyth print and a
//! Switchboard print that agree; neither oracle alone can move money.

use crate::error::WickError;
use crate::state::{OracleSpec, BPS, PRICE_DECIMALS};
use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, VerificationLevel};
use switchboard_on_demand::on_demand::accounts::pull_feed::PRECISION;
use switchboard_on_demand::on_demand::oracle_quote::quote_account::SwitchboardQuote;
use switchboard_on_demand::QUOTE_PROGRAM_ID;

const SLOT_MS: i64 = 400;

/// A single oracle print normalised to 8 decimals.
#[derive(Clone, Copy, Debug)]
pub struct Print {
    pub price: i64,
    pub ts: i64,
}

fn rescale(value: i128, expo: i32) -> Result<i64> {
    let shift = expo + PRICE_DECIMALS as i32;
    let v = if shift >= 0 {
        value.checked_mul(10i128.pow(shift as u32))
    } else {
        Some(value / 10i128.pow((-shift) as u32))
    }
    .ok_or(WickError::MathOverflow)?;
    i64::try_from(v).map_err(|_| WickError::MathOverflow.into())
}

pub fn read_pyth(update: &PriceUpdateV2, spec: &OracleSpec) -> Result<Print> {
    require!(
        update.verification_level == VerificationLevel::Full,
        WickError::OracleInvalid
    );
    let p = update
        .get_price_unchecked(&spec.pyth_feed_id)
        .map_err(|_| WickError::OracleMismatch)?;
    require!(p.price > 0, WickError::OracleInvalid);
    Ok(Print {
        price: rescale(p.price as i128, p.exponent)?,
        ts: p.publish_time,
    })
}

/// Reads a Switchboard canonical OracleQuote account (written by the quote program after
/// Ed25519-verified oracle signatures). Quotes carry a slot, not a timestamp, so the
/// print time is estimated from the slot distance to the current clock.
pub fn read_switchboard(feed: &AccountInfo, spec: &OracleSpec, clock: &Clock) -> Result<Print> {
    require_keys_eq!(*feed.key, spec.sb_feed, WickError::OracleMismatch);
    require!(
        feed.owner.to_bytes() == QUOTE_PROGRAM_ID.to_bytes(),
        WickError::OracleMismatch
    );
    let data = feed.try_borrow_data()?;
    require!(data.len() > 8, WickError::OracleInvalid);
    let quote = SwitchboardQuote::deserialize(&mut &data[8..])
        .map_err(|_| WickError::OracleInvalid)?;
    require!(&quote.tail_discriminator == b"SBOD", WickError::OracleInvalid);
    let info = quote.feeds.first().ok_or(WickError::OracleInvalid)?;
    let value = info.feed_value();
    require!(value > 0, WickError::OracleInvalid);
    require!(quote.slot <= clock.slot, WickError::OracleInvalid);
    let age_ms = (clock.slot - quote.slot) as i64 * SLOT_MS;
    Ok(Print {
        price: rescale(value, -(PRECISION as i32))?,
        ts: clock.unix_timestamp - age_ms / 1000,
    })
}

/// Relative gap between the two prints, in bps of the lower one.
pub fn gap_bps(a: i64, b: i64) -> u64 {
    let lo = a.min(b).max(1) as u128;
    ((a - b).unsigned_abs() as u128 * BPS as u128 / lo) as u64
}

pub fn within(p: &Print, lo: i64, hi: i64) -> bool {
    p.ts >= lo && p.ts <= hi
}
