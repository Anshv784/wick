//! Dual-oracle reads. Every settlement and touch confirmation needs a Pyth print and a
//! Switchboard print that agree; neither oracle alone can move money.

use crate::error::WickError;
use crate::state::{OracleSpec, BPS, PRICE_DECIMALS};
use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, VerificationLevel};
use switchboard_on_demand::on_demand::accounts::pull_feed::PRECISION;
use switchboard_on_demand::on_demand::oracle_quote::quote_account::QUOTE_DISCRIMINATOR;
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

/// Reads a Switchboard canonical OracleQuote account (written only by the quote program after
/// Ed25519-verified oracle signatures). Quotes carry a slot, not a timestamp, so the
/// print time is estimated from the slot distance to the current clock.
pub fn read_switchboard(feed: &AccountInfo, spec: &OracleSpec, clock: &Clock) -> Result<Print> {
    require_keys_eq!(*feed.key, spec.sb_feed, WickError::OracleMismatch);
    require!(
        feed.owner.to_bytes() == QUOTE_PROGRAM_ID.to_bytes(),
        WickError::OracleMismatch
    );
    let data = feed.try_borrow_data()?;
    let (value, slot) = parse_quote(&data).ok_or(WickError::OracleInvalid)?;
    require!(value > 0, WickError::OracleInvalid);
    require!(slot <= clock.slot, WickError::OracleInvalid);
    let age_ms = (clock.slot - slot) as i64 * SLOT_MS;
    Ok(Print {
        price: rescale(value, -(PRECISION as i32))?,
        ts: clock.unix_timestamp - age_ms / 1000,
    })
}

/// Parses a canonical quote account:
/// `"SBOracle" | queue (32) | u16 len | Ed25519 ix data`, where the Ed25519 data is
/// `n | pad | offsets (14·n) | pubkeys+sigs | message | oracle idxs (n) | slot u64 | version u8 | "SBOD"`
/// and the message is `header (32) | feeds (49 each: id 32, value i128, min samples u8)`.
/// Returns the first feed's value (18 decimals) and the quote slot.
fn parse_quote(data: &[u8]) -> Option<(i128, u64)> {
    if data.get(..8)? != QUOTE_DISCRIMINATOR {
        return None;
    }
    let len = u16::from_le_bytes(data.get(40..42)?.try_into().ok()?) as usize;
    let ix = data.get(42..42 + len)?;
    let n = *ix.first()? as usize;
    if n == 0 || ix.get(ix.len() - 4..)? != b"SBOD" {
        return None;
    }
    let msg_off = u16::from_le_bytes(ix.get(10..12)?.try_into().ok()?) as usize;
    let msg_len = u16::from_le_bytes(ix.get(12..14)?.try_into().ok()?) as usize;
    if msg_len < 32 + 49 || msg_off + msg_len + n + 13 != ix.len() {
        return None;
    }
    let feed = ix.get(msg_off + 32..msg_off + 32 + 49)?;
    let value = i128::from_le_bytes(feed.get(32..48)?.try_into().ok()?);
    let suffix = msg_off + msg_len + n;
    let slot = u64::from_le_bytes(ix.get(suffix..suffix + 8)?.try_into().ok()?);
    Some((value, slot))
}

/// Relative gap between the two prints, in bps of the lower one.
pub fn gap_bps(a: i64, b: i64) -> u64 {
    let lo = a.min(b).max(1) as u128;
    ((a - b).unsigned_abs() as u128 * BPS as u128 / lo) as u64
}

pub fn within(p: &Print, lo: i64, hi: i64) -> bool {
    p.ts >= lo && p.ts <= hi
}
