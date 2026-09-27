use anchor_lang::prelude::*;

#[error_code]
pub enum WickError {
    #[msg("Market is not open")]
    MarketNotOpen,
    #[msg("Market has expired")]
    Expired,
    #[msg("Market has not expired yet")]
    NotExpired,
    #[msg("Invalid market parameters")]
    InvalidParams,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Slippage limit exceeded")]
    Slippage,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Oracle account does not match the market")]
    OracleMismatch,
    #[msg("Oracle price is stale or outside the allowed window")]
    OracleStale,
    #[msg("Oracle price is invalid")]
    OracleInvalid,
    #[msg("Both oracles must confirm the touch")]
    TouchNotConfirmed,
    #[msg("House reserve cannot back this ticket")]
    HouseCapacity,
    #[msg("Ticket is not in the required state")]
    TicketState,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Void delay has not elapsed")]
    VoidTooEarly,
    #[msg("Unauthorized")]
    Unauthorized,
}
