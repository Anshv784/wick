//! Perpetuals: oracle-priced longs and shorts on SOL/BTC/ETH against a shared LP pool.
//!
//! All perp state (pool, markets, trader accounts) lives on the MagicBlock ER while trading.
//! USDC only moves on base, into and out of a trader's credit balance; every trade, LP
//! deposit and liquidation is an internal transfer between credit, collateral and the pool.
//!
//! "Wick-proof": a position is only liquidated when Pyth AND Switchboard both put it under
//! maintenance margin.

use crate::error::WickError;
use crate::state::{OracleSpec, BPS};
use anchor_lang::prelude::*;

pub const SEED_PERP_POOL: &[u8] = b"perp_pool";
pub const SEED_PERP_VAULT: &[u8] = b"perp_vault";
pub const SEED_PERP_MARKET: &[u8] = b"perp_market";
pub const SEED_PERP_ACCOUNT: &[u8] = b"perp_account";

/// Three assets × long/short.
pub const SLOTS: usize = 6;
/// Borrow index fixed-point scale (fraction of size accrued).
pub const IDX_SCALE: u128 = 1_000_000_000_000;
/// Winning trades are paid at most this multiple of their collateral; the pool reserves it.
pub const MAX_PROFIT_MULT: u64 = 10;
/// Max age of the Pyth print used to execute a trade (the ER clone lags base by a few seconds).
pub const PERP_PRICE_MAX_AGE: i64 = 30;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum PerpSide {
    Long,
    Short,
}

#[account]
#[derive(InitSpace)]
pub struct PerpPool {
    pub admin: Pubkey,
    pub mint: Pubkey,
    /// LP-owned USDC (includes fees and trader losses, net of trader profits).
    pub liquidity: u64,
    pub shares: u64,
    /// Max profit the pool has promised to open positions.
    pub reserved: u64,
    pub fees: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

impl PerpPool {
    pub fn free(&self) -> u64 {
        self.liquidity.saturating_sub(self.reserved)
    }
}

#[account]
#[derive(InitSpace)]
pub struct PerpMarket {
    pub symbol: [u8; 16],
    /// Slot index base: this market uses slots index*2 (long) and index*2+1 (short).
    pub index: u8,
    pub oracle: OracleSpec,
    pub max_leverage: u16,
    pub open_fee_bps: u16,
    pub close_fee_bps: u16,
    /// Maintenance margin, in bps of size.
    pub maint_bps: u16,
    pub liq_fee_bps: u16,
    /// Borrow fee in parts-per-million of size per hour.
    pub borrow_ppm_per_hour: u32,
    pub max_oi: u64,
    pub long_oi: u64,
    pub short_oi: u64,
    pub borrow_idx: u128,
    pub last_update: i64,
    pub bump: u8,
}

impl PerpMarket {
    pub fn accrue(&mut self, now: i64) {
        if self.last_update > 0 && now > self.last_update {
            let dt = (now - self.last_update) as u128;
            self.borrow_idx += self.borrow_ppm_per_hour as u128 * (IDX_SCALE / 1_000_000) * dt / 3_600;
        }
        self.last_update = now;
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, Debug, InitSpace)]
pub struct Slot {
    /// Notional in USDC base units (0 = empty).
    pub size: u64,
    pub collateral: u64,
    pub entry_price: i64,
    pub borrow_idx: u128,
    /// Profit the pool reserved for this position.
    pub reserve: u64,
    pub opened_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct PerpAccount {
    pub owner: Pubkey,
    /// Free USDC, usable as collateral or for LP deposits.
    pub credit: u64,
    pub lp_shares: u64,
    pub slots: [Slot; SLOTS],
    pub bump: u8,
}

/// Signed PnL of `size` opened at `entry` and marked at `price`.
pub fn pnl(side: PerpSide, size: u64, entry: i64, price: i64) -> Result<i64> {
    require!(entry > 0 && price > 0, WickError::OracleInvalid);
    let diff = match side {
        PerpSide::Long => price as i128 - entry as i128,
        PerpSide::Short => entry as i128 - price as i128,
    };
    i64::try_from(size as i128 * diff / entry as i128).map_err(|_| WickError::MathOverflow.into())
}

pub fn borrow_fee(slot: &Slot, market_idx: u128) -> u64 {
    (slot.size as u128 * market_idx.saturating_sub(slot.borrow_idx) / IDX_SCALE) as u64
}

pub fn fee(size: u64, bps: u16) -> u64 {
    (size as u128 * bps as u128).div_ceil(BPS as u128) as u64
}

/// Collateral + PnL − accrued borrow − close fee, at `price`.
pub fn equity(slot: &Slot, side: PerpSide, m: &PerpMarket, price: i64) -> Result<i64> {
    let p = pnl(side, slot.size, slot.entry_price, price)?.min(slot.reserve as i64);
    Ok(slot.collateral as i64 + p - borrow_fee(slot, m.borrow_idx) as i64 - fee(slot.size, m.close_fee_bps) as i64)
}

pub fn is_liquidatable(slot: &Slot, side: PerpSide, m: &PerpMarket, price: i64) -> Result<bool> {
    let maint = (slot.size as u128 * m.maint_bps as u128 / BPS as u128) as i64;
    Ok(equity(slot, side, m, price)? < maint)
}

/// Harmonic mean entry when adding `add` notional at `price` to an existing position.
pub fn merged_entry(size: u64, entry: i64, add: u64, price: i64) -> i64 {
    if size == 0 {
        return price;
    }
    let total = size as u128 + add as u128;
    let denom = size as u128 * 1_000_000_000_000 / entry as u128 + add as u128 * 1_000_000_000_000 / price as u128;
    (total * 1_000_000_000_000 / denom) as i64
}

pub fn slot_index(market: &PerpMarket, side: PerpSide) -> usize {
    market.index as usize * 2 + if side == PerpSide::Long { 0 } else { 1 }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn market() -> PerpMarket {
        PerpMarket {
            symbol: [0; 16],
            index: 0,
            oracle: OracleSpec { pyth_feed_id: [0; 32], pyth_account: Pubkey::default(), sb_feed: Pubkey::default(), max_dev_bps: 50 },
            max_leverage: 50,
            open_fee_bps: 6,
            close_fee_bps: 6,
            maint_bps: 50,
            liq_fee_bps: 20,
            borrow_ppm_per_hour: 100,
            max_oi: 0,
            long_oi: 0,
            short_oi: 0,
            borrow_idx: 0,
            last_update: 0,
            bump: 0,
        }
    }

    #[test]
    fn long_pnl_and_liquidation() {
        let m = market();
        let s = Slot { size: 1_000_000_000, collateral: 50_000_000, entry_price: 100_00000000, reserve: 500_000_000, ..Default::default() };
        assert_eq!(pnl(PerpSide::Long, s.size, s.entry_price, 101_00000000).unwrap(), 10_000_000);
        // 20x: a ~4.4% drop leaves equity under 0.5% maintenance.
        assert!(!is_liquidatable(&s, PerpSide::Long, &m, 96_00000000).unwrap());
        assert!(is_liquidatable(&s, PerpSide::Long, &m, 95_40000000).unwrap());
    }

    #[test]
    fn profit_is_capped_by_reserve() {
        let m = market();
        let s = Slot { size: 1_000_000_000, collateral: 20_000_000, entry_price: 100_00000000, reserve: 200_000_000, ..Default::default() };
        let e = equity(&s, PerpSide::Long, &m, 200_00000000).unwrap();
        assert!(e <= 220_000_000);
    }

    #[test]
    fn borrow_accrues() {
        let mut m = market();
        m.accrue(1_000);
        m.accrue(1_000 + 3_600);
        let s = Slot { size: 1_000_000_000, ..Default::default() };
        assert_eq!(borrow_fee(&s, m.borrow_idx), 100_000); // 0.01% of 1,000 USDC
    }

    #[test]
    fn merged_entry_is_harmonic() {
        let e = merged_entry(1_000_000, 100_00000000, 1_000_000, 200_00000000);
        assert!((e - 133_33333333).abs() < 10);
    }
}
