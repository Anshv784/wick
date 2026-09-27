//! Pool and touch-pricing math.
//!
//! The pool is a fixed-product market maker (FPMM): every unit of collateral mints one
//! YES + one NO share, and the pool keeps `yes_reserve * no_reserve` constant.
//! Touch tickets are priced with driftless one-touch probabilities on log-price.

use crate::error::WickError;
use crate::state::{TouchKind, BPS};
use anchor_lang::prelude::*;

const SECS_PER_YEAR: f64 = 31_536_000.0;
/// Quotes are clamped into [MIN, MAX] so no ticket is free or a sure loss for the house.
pub const MIN_PRICE_BPS: u64 = 100;
pub const MAX_PRICE_BPS: u64 = 9_500;

fn isqrt_ceil(n: u128) -> u128 {
    if n < 2 {
        return n;
    }
    let mut x = (n as f64).sqrt() as u128;
    while x * x > n {
        x -= 1;
    }
    while x * x < n {
        x += 1;
    }
    x
}

/// Buy `side` with `collateral` (already net of fees). Returns (shares_out, new_side, new_other).
pub fn fpmm_buy(side_res: u64, other_res: u64, collateral: u64) -> Result<(u64, u64, u64)> {
    require!(collateral > 0, WickError::InvalidParams);
    let k = side_res as u128 * other_res as u128;
    let side1 = side_res as u128 + collateral as u128;
    let other1 = other_res as u128 + collateral as u128;
    // Round the pool's remaining shares up so rounding always favours the pool.
    let new_side = k.div_ceil(other1);
    let out = side1.checked_sub(new_side).ok_or(WickError::MathOverflow)?;
    Ok((
        u64::try_from(out).map_err(|_| WickError::MathOverflow)?,
        u64::try_from(new_side).map_err(|_| WickError::MathOverflow)?,
        u64::try_from(other1).map_err(|_| WickError::MathOverflow)?,
    ))
}

/// Sell `shares` of `side` back to the pool. Returns (collateral_out, new_side, new_other).
/// Solves (side + shares - c) * (other - c) = k for c.
pub fn fpmm_sell(side_res: u64, other_res: u64, shares: u64) -> Result<(u64, u64, u64)> {
    require!(shares > 0, WickError::InvalidParams);
    let k = side_res as u128 * other_res as u128;
    let a = side_res as u128 + shares as u128;
    let b = other_res as u128;
    let sum = a + b;
    let disc = sum * sum - 4 * (a * b - k);
    // Ceil the root so c rounds down (pool-favoured).
    let c = (sum - isqrt_ceil(disc)) / 2;
    let c = c.min(b.saturating_sub(1));
    Ok((
        u64::try_from(c).map_err(|_| WickError::MathOverflow)?,
        u64::try_from(a - c).map_err(|_| WickError::MathOverflow)?,
        u64::try_from(b - c).map_err(|_| WickError::MathOverflow)?,
    ))
}

pub fn fee_of(amount: u64, fee_bps: u16) -> u64 {
    (amount as u128 * fee_bps as u128).div_ceil(BPS as u128) as u64
}

fn norm_cdf(x: f64) -> f64 {
    0.5 * (1.0 + libm::erf(x / core::f64::consts::SQRT_2))
}

/// Probability that a driftless log-price starting at `spot` touches `barrier` within `t_secs`.
fn one_touch(spot: f64, barrier: f64, sigma_sqrt_t: f64) -> f64 {
    let dist = libm::fabs(libm::log(barrier / spot));
    (2.0 * (1.0 - norm_cdf(dist / sigma_sqrt_t))).clamp(0.0, 1.0)
}

/// Fair touch probability (bps, before margin).
pub fn touch_fair_bps(
    kind: TouchKind,
    spot: i64,
    barrier: i64,
    barrier2: i64,
    vol_bps: u32,
    t_secs: i64,
) -> Result<u64> {
    require!(spot > 0 && barrier > 0 && t_secs > 0, WickError::InvalidParams);
    let s = spot as f64;
    let h = barrier as f64;
    let sst = (vol_bps as f64 / BPS as f64) * libm::sqrt(t_secs as f64 / SECS_PER_YEAR);
    require!(sst > 0.0, WickError::InvalidParams);
    let p = match kind {
        TouchKind::Up => {
            require!(barrier > spot, WickError::InvalidParams);
            one_touch(s, h, sst)
        }
        TouchKind::Down => {
            require!(barrier < spot, WickError::InvalidParams);
            one_touch(s, h, sst)
        }
        TouchKind::UpBeforeDown => {
            require!(barrier > spot && barrier2 > 0 && barrier2 < spot, WickError::InvalidParams);
            let l = barrier2 as f64;
            // Exit-first probability for a driftless log-price, capped by the chance of
            // touching the upper level at all before expiry. Both are upper bounds, so the
            // min never under-prices the ticket.
            let first = libm::log(s / l) / libm::log(h / l);
            first.min(one_touch(s, h, sst))
        }
    };
    Ok((p * BPS as f64) as u64)
}

/// Quoted ticket price in bps: fair probability plus house margin, clamped.
pub fn touch_quote_bps(fair_bps: u64, margin_bps: u16) -> u64 {
    let priced = fair_bps + fair_bps * margin_bps as u64 / BPS;
    priced.clamp(MIN_PRICE_BPS, MAX_PRICE_BPS)
}

pub fn payout_for(stake: u64, price_bps: u64) -> Result<u64> {
    let p = stake as u128 * BPS as u128 / price_bps as u128;
    u64::try_from(p).map_err(|_| WickError::MathOverflow.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buy_then_sell_never_profits() {
        let (out, y, n) = fpmm_buy(100_000_000, 100_000_000, 10_000_000).unwrap();
        let (back, _, _) = fpmm_sell(y, n, out).unwrap();
        assert!(back <= 10_000_000);
        assert!(back >= 9_999_000);
    }

    #[test]
    fn buy_moves_price() {
        let (out, y, n) = fpmm_buy(100_000_000, 100_000_000, 50_000_000).unwrap();
        assert!(out > 50_000_000);
        assert!(n * 10_000 / (y + n) > 5_000);
    }

    #[test]
    fn touch_prices_are_sane() {
        let day = 86_400;
        let spot = 200_00000000;
        let near = touch_fair_bps(TouchKind::Up, spot, 202_00000000, 0, 6000, day).unwrap();
        let far = touch_fair_bps(TouchKind::Up, spot, 240_00000000, 0, 6000, day).unwrap();
        assert!(near > far);
        assert!(near > 5000 && near < 9000, "near={near}");
        assert!(far < 100, "far={far}");
        let rng =
            touch_fair_bps(TouchKind::UpBeforeDown, spot, 210_00000000, 190_00000000, 6000, 7 * day)
                .unwrap();
        assert!(rng > 4000 && rng < 5200, "rng={rng}");
    }
}
