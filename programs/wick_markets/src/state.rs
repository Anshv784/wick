use anchor_lang::prelude::*;

/// Prices inside Wick are fixed-point with 8 decimals (1 USD = 100_000_000).
pub const PRICE_DECIMALS: u32 = 8;
/// One outcome share pays out 1 USDC (6 decimals).
pub const SHARE_UNIT: u64 = 1_000_000;

pub const BPS: u64 = 10_000;
/// Oracle prints used for settlement must land within this window after expiry.
pub const SETTLE_WINDOW_SECS: i64 = 600;
/// A frozen or unsettled market can be voided (50/50 redemption) after this delay.
pub const VOID_DELAY_SECS: i64 = 86_400;
/// Max staleness of a spot price used to quote a touch ticket.
pub const QUOTE_MAX_AGE_SECS: u64 = 60;
/// Pyth and Switchboard prints confirming a touch must be this close in time.
pub const TOUCH_SYNC_SECS: i64 = 30;

pub const SEED_MARKET: &[u8] = b"market";
pub const SEED_VAULT: &[u8] = b"vault";
pub const SEED_POSITION: &[u8] = b"position";
pub const SEED_BOOK: &[u8] = b"touch_book";
pub const SEED_TOUCH_VAULT: &[u8] = b"touch_vault";
pub const SEED_TICKET: &[u8] = b"ticket";

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum MarketStatus {
    Open,
    Settled,
    Frozen,
    Voided,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum Side {
    Yes,
    No,
}

/// Oracle configuration shared by the market and its touch book.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace)]
pub struct OracleSpec {
    /// Pyth price feed id (hex feed id, 32 bytes).
    pub pyth_feed_id: [u8; 32],
    /// Switchboard canonical OracleQuote account for the feed hash.
    pub sb_feed: Pubkey,
    /// Max relative gap between the two oracles before they are treated as disagreeing.
    pub max_dev_bps: u16,
}

/// "Will <asset> be >= strike at expiry?" — traded through a YES/NO pool on the ER.
#[account]
#[derive(InitSpace)]
pub struct Market {
    pub creator: Pubkey,
    pub market_id: u64,
    pub mint: Pubkey,
    pub symbol: [u8; 16],
    pub oracle: OracleSpec,
    pub strike: i64,
    pub expiry: i64,
    pub fee_bps: u16,
    pub status: MarketStatus,
    pub outcome: Option<Side>,
    /// FPMM reserves (shares held by the pool).
    pub yes_reserve: u64,
    pub no_reserve: u64,
    pub fees_accrued: u64,
    pub lp_claimed: bool,
    pub volume: u64,
    pub settle_pyth: i64,
    pub settle_sb: i64,
    pub resolved_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
}

impl Market {
    /// YES probability in bps, from the pool reserves.
    pub fn yes_price_bps(&self) -> u64 {
        let total = self.yes_reserve as u128 + self.no_reserve as u128;
        if total == 0 {
            return 5_000;
        }
        (self.no_reserve as u128 * BPS as u128 / total) as u64
    }
}

/// A trader's pool account for one market. Holds internal USDC credit plus shares so
/// that trades can run on the ephemeral rollup without token transfers.
#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub balance: u64,
    pub yes: u64,
    pub no: u64,
    pub claimed: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum TouchKind {
    /// Pays if price trades at or above `barrier` before expiry.
    Up,
    /// Pays if price trades at or below `barrier` before expiry.
    Down,
    /// Pays if price hits `barrier` (upper) before `barrier2` (lower), before expiry.
    UpBeforeDown,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum TicketStatus {
    Open,
    Won,
    Lost,
    Claimed,
}

/// House book for touch tickets. Lives on the base layer next to its market so the
/// market can sit on the ER. Every ticket reserves its full payout when bought.
#[account]
#[derive(InitSpace)]
pub struct TouchBook {
    pub market: Pubkey,
    pub house: Pubkey,
    pub mint: Pubkey,
    pub oracle: OracleSpec,
    pub expiry: i64,
    /// Annualised volatility used for pricing, in bps (6_000 = 60%).
    pub vol_bps: u32,
    /// House edge on top of fair probability, in bps.
    pub margin_bps: u16,
    /// Max payout a single ticket may lock, in USDC base units.
    pub max_payout: u64,
    /// House capital not backing any ticket.
    pub free: u64,
    /// Payouts reserved for open tickets (stakes included).
    pub locked: u64,
    pub ticket_count: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct TouchTicket {
    pub book: Pubkey,
    pub owner: Pubkey,
    pub id: u64,
    pub kind: TouchKind,
    pub barrier: i64,
    pub barrier2: i64,
    pub spot: i64,
    pub stake: u64,
    pub payout: u64,
    /// Quoted probability incl. margin, bps.
    pub price_bps: u16,
    pub created_at: i64,
    pub status: TicketStatus,
    pub hit_pyth: i64,
    pub hit_sb: i64,
    pub hit_at: i64,
    pub bump: u8,
}
