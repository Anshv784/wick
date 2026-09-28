pub mod error;
pub mod ix;
pub mod math;
pub mod oracle;
pub mod perps;
pub mod state;

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

#[allow(ambiguous_glob_reexports)]
pub use ix::*;
pub use perps::{PerpAccount, PerpMarket, PerpPool, PerpSide, Slot};
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

    // ------------------------------------------------------------ perps

    pub fn init_perp_pool(ctx: Context<InitPerpPool>) -> Result<()> {
        ix::perps::init_perp_pool(ctx)
    }

    pub fn init_perp_market(ctx: Context<InitPerpMarket>, args: PerpMarketArgs) -> Result<()> {
        ix::perps::init_perp_market(ctx, args)
    }

    pub fn open_perp_account(ctx: Context<OpenPerpAccount>) -> Result<()> {
        ix::perps::open_perp_account(ctx)
    }

    pub fn perp_deposit(ctx: Context<PerpFunds>, amount: u64) -> Result<()> {
        ix::perps::perp_deposit(ctx, amount)
    }

    pub fn perp_withdraw(ctx: Context<PerpFunds>, amount: u64) -> Result<()> {
        ix::perps::perp_withdraw(ctx, amount)
    }

    pub fn open_perp(
        ctx: Context<PerpTrade>,
        side: PerpSide,
        collateral: u64,
        leverage_x10: u16,
        limit_price: i64,
    ) -> Result<()> {
        ix::perps::open_perp(ctx, side, collateral, leverage_x10, limit_price)
    }

    pub fn close_perp(ctx: Context<PerpTrade>, side: PerpSide, limit_price: i64, fraction_bps: u16) -> Result<()> {
        ix::perps::close_perp(ctx, side, limit_price, fraction_bps)
    }

    pub fn adjust_margin(ctx: Context<PerpTrade>, side: PerpSide, add: bool, amount: u64) -> Result<()> {
        ix::perps::adjust_margin(ctx, side, add, amount)
    }

    pub fn open_perp_orders(ctx: Context<OpenPerpOrders>) -> Result<()> {
        ix::perps::open_perp_orders(ctx)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn place_perp_order(
        ctx: Context<ManagePerpOrder>,
        kind: PerpOrderKind,
        market_index: u8,
        is_long: bool,
        trigger: i64,
        collateral: u64,
        leverage_x10: u16,
    ) -> Result<()> {
        ix::perps::place_perp_order(ctx, kind, market_index, is_long, trigger, collateral, leverage_x10)
    }

    pub fn cancel_perp_order(ctx: Context<ManagePerpOrder>, index: u8) -> Result<()> {
        ix::perps::cancel_perp_order(ctx, index)
    }

    pub fn execute_perp_order(ctx: Context<ExecutePerpOrder>, index: u8) -> Result<()> {
        ix::perps::execute_perp_order(ctx, index)
    }

    pub fn delegate_perp_orders(ctx: Context<DelegatePerpOrders>) -> Result<()> {
        ix::perps::delegate_perp_orders(ctx)
    }

    // ------------------------------------------------------------ prediction limit orders

    pub fn open_pool_orders(ctx: Context<OpenPoolOrders>) -> Result<()> {
        ix::pool::open_pool_orders(ctx)
    }

    pub fn place_pool_order(ctx: Context<ManagePoolOrder>, is_yes: bool, is_buy: bool, amount: u64, limit_bps: u16) -> Result<()> {
        ix::pool::place_pool_order(ctx, is_yes, is_buy, amount, limit_bps)
    }

    pub fn cancel_pool_order(ctx: Context<ManagePoolOrder>, index: u8) -> Result<()> {
        ix::pool::cancel_pool_order(ctx, index)
    }

    pub fn execute_pool_order(ctx: Context<ExecutePoolOrder>, index: u8) -> Result<()> {
        ix::pool::execute_pool_order(ctx, index)
    }

    pub fn delegate_pool_orders(ctx: Context<DelegatePoolOrders>) -> Result<()> {
        ix::pool::delegate_pool_orders(ctx)
    }

    // ------------------------------------------------------------ session keys

    pub fn set_session(ctx: Context<SetSession>, key: Pubkey, expires_at: i64) -> Result<()> {
        ix::session::set_session(ctx, key, expires_at)
    }

    pub fn revoke_session(ctx: Context<RevokeSession>) -> Result<()> {
        ix::session::revoke_session(ctx)
    }

    pub fn close_by_stop(ctx: Context<CloseByStop>, side: PerpSide) -> Result<()> {
        ix::perps::close_by_stop(ctx, side)
    }

    pub fn liquidate_perp(ctx: Context<Liquidate>, side: PerpSide) -> Result<()> {
        ix::perps::liquidate_perp(ctx, side)
    }

    pub fn lp_deposit(ctx: Context<PerpLp>, amount: u64) -> Result<()> {
        ix::perps::lp_deposit(ctx, amount)
    }

    pub fn lp_withdraw(ctx: Context<PerpLp>, shares: u64) -> Result<()> {
        ix::perps::lp_withdraw(ctx, shares)
    }

    pub fn delegate_perp_pool(ctx: Context<DelegatePerpPool>) -> Result<()> {
        ix::perps::delegate_perp_pool(ctx)
    }

    pub fn delegate_perp_market(ctx: Context<DelegatePerpMarket>, symbol: [u8; 16]) -> Result<()> {
        ix::perps::delegate_perp_market(ctx, symbol)
    }

    pub fn delegate_perp_account(ctx: Context<DelegatePerpAccount>) -> Result<()> {
        ix::perps::delegate_perp_account(ctx)
    }

    pub fn undelegate_perp_account(ctx: Context<UndelegatePerpAccount>) -> Result<()> {
        ix::perps::undelegate_perp_account(ctx)
    }
}
