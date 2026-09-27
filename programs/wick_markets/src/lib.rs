pub mod error;
pub mod ix;
pub mod math;
pub mod oracle;
pub mod state;

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

#[allow(ambiguous_glob_reexports)]
pub use ix::*;
pub use state::*;

declare_id!("336JyfBdwevzzuuQ5dy1LF5aQPatq947z6Td6111qxow");

#[ephemeral]
#[program]
pub mod wick_markets {
    use super::*;

    pub fn create_market(ctx: Context<CreateMarket>, args: CreateMarketArgs) -> Result<()> {
        ix::market::create_market(ctx, args)
    }

    pub fn create_touch_book(ctx: Context<CreateTouchBook>, args: CreateBookArgs) -> Result<()> {
        ix::market::create_touch_book(ctx, args)
    }

    pub fn fund_house(ctx: Context<HouseFunds>, amount: u64) -> Result<()> {
        ix::market::fund_house(ctx, amount)
    }

    pub fn withdraw_house(ctx: Context<HouseFunds>, amount: u64) -> Result<()> {
        ix::market::withdraw_house(ctx, amount)
    }

    pub fn open_position(ctx: Context<OpenPosition>) -> Result<()> {
        ix::pool::open_position(ctx)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        ix::pool::deposit(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        ix::pool::withdraw(ctx, amount)
    }

    pub fn buy(ctx: Context<Trade>, side: Side, amount: u64, min_shares: u64) -> Result<()> {
        ix::pool::buy(ctx, side, amount, min_shares)
    }

    pub fn sell(ctx: Context<Trade>, side: Side, shares: u64, min_out: u64) -> Result<()> {
        ix::pool::sell(ctx, side, shares, min_out)
    }

    pub fn delegate_market(ctx: Context<DelegateMarket>, market_id: u64) -> Result<()> {
        ix::pool::delegate_market(ctx, market_id)
    }

    pub fn delegate_position(ctx: Context<DelegatePosition>) -> Result<()> {
        ix::pool::delegate_position(ctx)
    }

    pub fn undelegate_market(ctx: Context<UndelegateMarket>) -> Result<()> {
        ix::pool::undelegate_market(ctx)
    }

    pub fn undelegate_position(ctx: Context<UndelegatePosition>) -> Result<()> {
        ix::pool::undelegate_position(ctx)
    }

    pub fn settle_market(ctx: Context<Settle>) -> Result<()> {
        ix::settle::settle_market(ctx)
    }

    pub fn void_market(ctx: Context<Void>) -> Result<()> {
        ix::settle::void_market(ctx)
    }

    pub fn claim(ctx: Context<Withdraw>) -> Result<()> {
        ix::pool::claim(ctx)
    }

    pub fn claim_lp(ctx: Context<ClaimLp>) -> Result<()> {
        ix::pool::claim_lp(ctx)
    }

    pub fn buy_ticket(ctx: Context<BuyTicket>, args: BuyTicketArgs) -> Result<()> {
        ix::touch::buy_ticket(ctx, args)
    }

    pub fn confirm_touch(ctx: Context<ConfirmTouch>) -> Result<()> {
        ix::touch::confirm_touch(ctx)
    }

    pub fn expire_ticket(ctx: Context<ExpireTicket>) -> Result<()> {
        ix::touch::expire_ticket(ctx)
    }

    pub fn claim_ticket(ctx: Context<ClaimTicket>) -> Result<()> {
        ix::touch::claim_ticket(ctx)
    }
}
