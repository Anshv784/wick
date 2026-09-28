use crate::error::WickError;
use crate::oracle::{gap_bps, read_pyth_pinned, read_switchboard, Print};
use crate::perps::*;
use crate::ix::session::{authorize, Session};
use crate::state::{OracleSpec, BPS};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use ephemeral_rollups_sdk::anchor::{commit, delegate};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

// ---------------------------------------------------------------- setup (base)

#[derive(Accounts)]
pub struct InitPerpPool<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + PerpPool::INIT_SPACE, seeds = [SEED_PERP_POOL], bump)]
    pub pool: Account<'info, PerpPool>,
    #[account(
        init,
        payer = admin,
        seeds = [SEED_PERP_VAULT],
        bump,
        token::mint = mint,
        token::authority = pool,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn init_perp_pool(ctx: Context<InitPerpPool>) -> Result<()> {
    ctx.accounts.pool.set_inner(PerpPool {
        admin: ctx.accounts.admin.key(),
        mint: ctx.accounts.mint.key(),
        liquidity: 0,
        shares: 0,
        reserved: 0,
        fees: 0,
        bump: ctx.bumps.pool,
        vault_bump: ctx.bumps.vault,
    });
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PerpMarketArgs {
    pub symbol: [u8; 16],
    pub index: u8,
    pub oracle: OracleSpec,
    pub max_leverage: u16,
    pub open_fee_bps: u16,
    pub close_fee_bps: u16,
    pub maint_bps: u16,
    pub liq_fee_bps: u16,
    pub borrow_ppm_per_hour: u32,
    pub max_oi: u64,
}

#[derive(Accounts)]
#[instruction(args: PerpMarketArgs)]
pub struct InitPerpMarket<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(has_one = admin)]
    pub pool: Account<'info, PerpPool>,
    #[account(
        init,
        payer = admin,
        space = 8 + PerpMarket::INIT_SPACE,
        seeds = [SEED_PERP_MARKET, &args.symbol],
        bump,
    )]
    pub market: Account<'info, PerpMarket>,
    pub system_program: Program<'info, System>,
}

pub fn init_perp_market(ctx: Context<InitPerpMarket>, args: PerpMarketArgs) -> Result<()> {
    require!((args.index as usize) * 2 + 1 < SLOTS, WickError::InvalidParams);
    require!(args.max_leverage >= 1 && args.max_leverage <= 100, WickError::InvalidParams);
    require!(args.maint_bps > 0 && args.maint_bps < 1_000, WickError::InvalidParams);
    // Liquidation must happen before collateral runs out at max leverage.
    require!((args.maint_bps as u64) < BPS / args.max_leverage as u64, WickError::InvalidParams);
    ctx.accounts.market.set_inner(PerpMarket {
        symbol: args.symbol,
        index: args.index,
        oracle: args.oracle,
        max_leverage: args.max_leverage,
        open_fee_bps: args.open_fee_bps,
        close_fee_bps: args.close_fee_bps,
        maint_bps: args.maint_bps,
        liq_fee_bps: args.liq_fee_bps,
        borrow_ppm_per_hour: args.borrow_ppm_per_hour,
        max_oi: args.max_oi,
        long_oi: 0,
        short_oi: 0,
        borrow_idx: 0,
        last_update: Clock::get()?.unix_timestamp,
        bump: ctx.bumps.market,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct OpenPerpAccount<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + PerpAccount::INIT_SPACE,
        seeds = [SEED_PERP_ACCOUNT, owner.key().as_ref()],
        bump,
    )]
    pub account: Account<'info, PerpAccount>,
    pub system_program: Program<'info, System>,
}

pub fn open_perp_account(ctx: Context<OpenPerpAccount>) -> Result<()> {
    ctx.accounts.account.set_inner(PerpAccount {
        owner: ctx.accounts.owner.key(),
        credit: 0,
        lp_shares: 0,
        slots: [Slot::default(); SLOTS],
        bump: ctx.bumps.account,
    });
    Ok(())
}

// ---------------------------------------------------------------- USDC in/out (base)

/// The pool may be delegated, so it is only used as a PDA signer here (never deserialized).
#[derive(Accounts)]
pub struct PerpFunds<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner)]
    pub account: Account<'info, PerpAccount>,
    /// CHECK: pool PDA; signs vault transfers via seeds only.
    #[account(seeds = [SEED_PERP_POOL], bump)]
    pub pool: UncheckedAccount<'info>,
    #[account(mut, seeds = [SEED_PERP_VAULT], bump, token::authority = pool)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = vault.mint, token::authority = owner)]
    pub owner_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn perp_deposit(ctx: Context<PerpFunds>, amount: u64) -> Result<()> {
    require!(amount > 0, WickError::InvalidParams);
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.owner_token.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
    )?;
    ctx.accounts.account.credit += amount;
    Ok(())
}

pub fn perp_withdraw(ctx: Context<PerpFunds>, amount: u64) -> Result<()> {
    let acc = &mut ctx.accounts.account;
    require!(amount > 0 && amount <= acc.credit, WickError::InsufficientBalance);
    acc.credit -= amount;
    let bump = ctx.bumps.pool;
    let seeds: &[&[u8]] = &[SEED_PERP_POOL, &[bump]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.owner_token.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )
}

// ---------------------------------------------------------------- trading (ER)

/// Signed by the account owner or their session key.
#[derive(Accounts)]
pub struct PerpTrade<'info> {
    pub signer: Signer<'info>,
    #[account(mut, seeds = [SEED_PERP_POOL], bump = pool.bump)]
    pub pool: Account<'info, PerpPool>,
    #[account(mut, seeds = [SEED_PERP_MARKET, &market.symbol], bump = market.bump)]
    pub market: Account<'info, PerpMarket>,
    #[account(mut)]
    pub account: Account<'info, PerpAccount>,
    pub price_update: Account<'info, PriceUpdateV2>,
    pub session: Option<Account<'info, Session>>,
}

fn exec_price(update: &Account<PriceUpdateV2>, spec: &OracleSpec) -> Result<Print> {
    let p = read_pyth_pinned(update, spec)?;
    let now = Clock::get()?.unix_timestamp;
    require!((0..=PERP_PRICE_MAX_AGE).contains(&(now - p.ts)), WickError::OracleStale);
    Ok(p)
}

/// Opens or adds `collateral × leverage` at `price`, moving `collateral` out of credit.
#[allow(clippy::too_many_arguments)]
fn open_inner(
    pool: &mut PerpPool,
    m: &mut PerpMarket,
    market_key: Pubkey,
    acc: &mut PerpAccount,
    side: PerpSide,
    collateral: u64,
    leverage_x10: u16,
    price: i64,
    now: i64,
) -> Result<()> {
    require!(
        leverage_x10 >= 11 && leverage_x10 as u64 <= m.max_leverage as u64 * 10,
        WickError::InvalidParams
    );
    require!(collateral >= 1_000_000 && collateral <= acc.credit, WickError::InsufficientBalance);

    let size = collateral * leverage_x10 as u64 / 10;
    let open_fee = fee(size, m.open_fee_bps);
    require!(open_fee < collateral, WickError::InvalidParams);
    let reserve = size.min(collateral * MAX_PROFIT_MULT);
    require!(pool.free() >= reserve, WickError::HouseCapacity);
    let max_oi = m.max_oi;
    let oi = match side {
        PerpSide::Long => &mut m.long_oi,
        PerpSide::Short => &mut m.short_oi,
    };
    require!(max_oi == 0 || *oi + size <= max_oi, WickError::HouseCapacity);
    *oi += size;

    let idx = slot_index(m, side);
    let s = &mut acc.slots[idx];
    // Settle accrued borrow on the existing leg before merging.
    let accrued = borrow_fee(s, m.borrow_idx);
    s.collateral = s.collateral.saturating_sub(accrued);
    s.entry_price = merged_entry(s.size, s.entry_price, size, price);
    s.size += size;
    s.collateral += collateral - open_fee;
    s.reserve += reserve;
    s.borrow_idx = m.borrow_idx;
    if s.opened_at == 0 {
        s.opened_at = now;
    }
    require!(
        s.size as u128 <= s.collateral as u128 * m.max_leverage as u128,
        WickError::InvalidParams
    );

    acc.credit -= collateral;
    pool.reserved += reserve;
    pool.liquidity += open_fee + accrued;
    pool.fees += open_fee + accrued;
    emit!(PerpTradeEvent {
        owner: acc.owner,
        market: market_key,
        side,
        is_open: true,
        size,
        price,
        pnl: 0,
        ts: now,
    });
    Ok(())
}

/// Opens or adds to a position. `limit_price` bounds execution (max for longs, min for shorts).
pub fn open_perp(
    ctx: Context<PerpTrade>,
    side: PerpSide,
    collateral: u64,
    leverage_x10: u16,
    limit_price: i64,
) -> Result<()> {
    authorize(&ctx.accounts.signer.key(), &ctx.accounts.account.owner, &ctx.accounts.session)?;
    let now = Clock::get()?.unix_timestamp;
    let market_key = ctx.accounts.market.key();
    let m = &mut ctx.accounts.market;
    m.accrue(now);
    let price = exec_price(&ctx.accounts.price_update, &m.oracle)?.price;
    match side {
        PerpSide::Long => require!(price <= limit_price, WickError::Slippage),
        PerpSide::Short => require!(price >= limit_price, WickError::Slippage),
    }
    open_inner(&mut ctx.accounts.pool, m, market_key, &mut ctx.accounts.account, side, collateral, leverage_x10, price, now)
}

/// Releases `fraction_bps` of a position back to the pool and pays the trader their share.
fn settle_part(pool: &mut PerpPool, m: &mut PerpMarket, s: &mut Slot, side: PerpSide, fraction_bps: u64, payout: u64) {
    let part = |v: u64| (v as u128 * fraction_bps as u128 / BPS as u128) as u64;
    let (size, collateral, reserve) = if fraction_bps >= BPS {
        (s.size, s.collateral, s.reserve)
    } else {
        (part(s.size), part(s.collateral), part(s.reserve))
    };
    // The pool receives the closed collateral and pays out `payout` (which includes profit).
    pool.liquidity = (pool.liquidity as i128 + collateral as i128 - payout as i128).max(0) as u64;
    pool.reserved = pool.reserved.saturating_sub(reserve);
    match side {
        PerpSide::Long => m.long_oi = m.long_oi.saturating_sub(size),
        PerpSide::Short => m.short_oi = m.short_oi.saturating_sub(size),
    }
    if fraction_bps >= BPS {
        *s = Slot::default();
    } else {
        s.size -= size;
        s.collateral -= collateral;
        s.reserve -= reserve;
    }
}

fn settle_slot(pool: &mut PerpPool, m: &mut PerpMarket, s: &mut Slot, side: PerpSide, payout: u64) {
    settle_part(pool, m, s, side, BPS, payout)
}

/// Closes `fraction_bps` (1..=10000) of a position at `price`.
#[allow(clippy::too_many_arguments)]
fn close_at(
    pool: &mut PerpPool,
    m: &mut PerpMarket,
    market_key: Pubkey,
    acc: &mut PerpAccount,
    side: PerpSide,
    price: i64,
    now: i64,
    fraction_bps: u64,
) -> Result<()> {
    require!(fraction_bps > 0 && fraction_bps <= BPS, WickError::InvalidParams);
    let idx = slot_index(m, side);
    let mut s = acc.slots[idx];
    require!(s.size > 0, WickError::NothingToClaim);
    // Borrow is settled on the whole leg first, so the remainder starts clean.
    let accrued = borrow_fee(&s, m.borrow_idx);
    s.collateral = s.collateral.saturating_sub(accrued);
    s.borrow_idx = m.borrow_idx;
    pool.liquidity += accrued;
    pool.fees += accrued;

    let part = |v: u64| (v as u128 * fraction_bps as u128 / BPS as u128) as u64;
    let closed = Slot {
        size: part(s.size),
        collateral: part(s.collateral),
        reserve: part(s.reserve),
        ..s
    };
    let payout = equity(&closed, side, m, price)?.max(0) as u64;
    let p = pnl(side, closed.size, s.entry_price, price)?.min(closed.reserve as i64);
    pool.fees += fee(closed.size, m.close_fee_bps);
    settle_part(pool, m, &mut s, side, fraction_bps, payout);
    // A leftover that's under maintenance would be instantly liquidatable; refuse the partial.
    if s.size > 0 {
        require!(!is_liquidatable(&s, side, m, price)?, WickError::InvalidParams);
    }
    acc.slots[idx] = s;
    acc.credit += payout;
    emit!(PerpTradeEvent {
        owner: acc.owner,
        market: market_key,
        side,
        is_open: false,
        size: closed.size,
        price,
        pnl: p,
        ts: now,
    });
    Ok(())
}

pub fn close_perp(ctx: Context<PerpTrade>, side: PerpSide, limit_price: i64, fraction_bps: u16) -> Result<()> {
    authorize(&ctx.accounts.signer.key(), &ctx.accounts.account.owner, &ctx.accounts.session)?;
    let now = Clock::get()?.unix_timestamp;
    let market_key = ctx.accounts.market.key();
    let m = &mut ctx.accounts.market;
    m.accrue(now);
    let price = exec_price(&ctx.accounts.price_update, &m.oracle)?.price;
    match side {
        PerpSide::Long => require!(price >= limit_price, WickError::Slippage),
        PerpSide::Short => require!(price <= limit_price, WickError::Slippage),
    }
    close_at(&mut ctx.accounts.pool, m, market_key, &mut ctx.accounts.account, side, price, now, fraction_bps as u64)
}

/// Moves collateral between free credit and a position. Removing margin must leave the
/// position within max leverage and above maintenance at the current price.
pub fn adjust_margin(ctx: Context<PerpTrade>, side: PerpSide, add: bool, amount: u64) -> Result<()> {
    authorize(&ctx.accounts.signer.key(), &ctx.accounts.account.owner, &ctx.accounts.session)?;
    let now = Clock::get()?.unix_timestamp;
    let m = &mut ctx.accounts.market;
    let acc = &mut ctx.accounts.account;
    m.accrue(now);
    let price = exec_price(&ctx.accounts.price_update, &m.oracle)?.price;
    let idx = slot_index(m, side);
    let mut s = acc.slots[idx];
    require!(s.size > 0 && amount > 0, WickError::InvalidParams);
    if add {
        require!(amount <= acc.credit, WickError::InsufficientBalance);
        acc.credit -= amount;
        s.collateral += amount;
    } else {
        require!(amount < s.collateral, WickError::InsufficientBalance);
        s.collateral -= amount;
        require!(
            s.size as u128 <= s.collateral as u128 * m.max_leverage as u128,
            WickError::InvalidParams
        );
        require!(!is_liquidatable(&s, side, m, price)?, WickError::InvalidParams);
        acc.credit += amount;
    }
    acc.slots[idx] = s;
    Ok(())
}

// ---------------------------------------------------------------- limit / TP / SL orders (ER)

pub const SEED_PERP_ORDERS: &[u8] = b"perp_orders";
pub const PERP_ORDER_SLOTS: usize = 8;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default, InitSpace)]
pub enum PerpOrderKind {
    #[default]
    None,
    /// Open when the price reaches the trigger (at or below for longs, at or above for shorts).
    LimitOpen,
    /// Close the whole leg when price moves in the trader's favour past the trigger.
    TakeProfit,
    /// Close the whole leg when price moves against the trader past the trigger.
    StopLoss,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, InitSpace)]
pub struct PerpOrder {
    pub kind: PerpOrderKind,
    pub market_index: u8,
    pub is_long: bool,
    pub trigger: i64,
    /// Escrowed collateral for limit opens.
    pub collateral: u64,
    pub leverage_x10: u16,
    pub created_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct PerpOrders {
    pub owner: Pubkey,
    pub orders: [PerpOrder; PERP_ORDER_SLOTS],
    pub bump: u8,
}

#[derive(Accounts)]
pub struct OpenPerpOrders<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + PerpOrders::INIT_SPACE,
        seeds = [SEED_PERP_ORDERS, owner.key().as_ref()],
        bump,
    )]
    pub orders: Account<'info, PerpOrders>,
    pub system_program: Program<'info, System>,
}

pub fn open_perp_orders(ctx: Context<OpenPerpOrders>) -> Result<()> {
    ctx.accounts.orders.set_inner(PerpOrders {
        owner: ctx.accounts.owner.key(),
        orders: [PerpOrder::default(); PERP_ORDER_SLOTS],
        bump: ctx.bumps.orders,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ManagePerpOrder<'info> {
    pub signer: Signer<'info>,
    #[account(mut)]
    pub account: Account<'info, PerpAccount>,
    #[account(mut, seeds = [SEED_PERP_ORDERS, account.owner.as_ref()], bump = orders.bump)]
    pub orders: Account<'info, PerpOrders>,
    pub session: Option<Account<'info, Session>>,
}

pub fn place_perp_order(
    ctx: Context<ManagePerpOrder>,
    kind: PerpOrderKind,
    market_index: u8,
    is_long: bool,
    trigger: i64,
    collateral: u64,
    leverage_x10: u16,
) -> Result<()> {
    authorize(&ctx.accounts.signer.key(), &ctx.accounts.account.owner, &ctx.accounts.session)?;
    require!(kind != PerpOrderKind::None && trigger > 0, WickError::InvalidParams);
    require!((market_index as usize) * 2 + 1 < SLOTS, WickError::InvalidParams);
    let acc = &mut ctx.accounts.account;
    let book = &mut ctx.accounts.orders;
    let slot = book.orders.iter().position(|o| o.kind == PerpOrderKind::None).ok_or(WickError::HouseCapacity)?;
    let escrow = if kind == PerpOrderKind::LimitOpen {
        require!(collateral >= 1_000_000 && collateral <= acc.credit, WickError::InsufficientBalance);
        require!(leverage_x10 >= 11, WickError::InvalidParams);
        collateral
    } else {
        let leg = acc.slots[market_index as usize * 2 + if is_long { 0 } else { 1 }];
        require!(leg.size > 0, WickError::NothingToClaim);
        0
    };
    acc.credit -= escrow;
    book.orders[slot] = PerpOrder {
        kind,
        market_index,
        is_long,
        trigger,
        collateral: escrow,
        leverage_x10,
        created_at: Clock::get()?.unix_timestamp,
    };
    Ok(())
}

pub fn cancel_perp_order(ctx: Context<ManagePerpOrder>, index: u8) -> Result<()> {
    authorize(&ctx.accounts.signer.key(), &ctx.accounts.account.owner, &ctx.accounts.session)?;
    let o = ctx.accounts.orders.orders.get_mut(index as usize).ok_or(WickError::InvalidParams)?;
    require!(o.kind != PerpOrderKind::None, WickError::TicketState);
    ctx.accounts.account.credit += o.collateral;
    *o = PerpOrder::default();
    Ok(())
}

#[derive(Accounts)]
pub struct ExecutePerpOrder<'info> {
    pub keeper: Signer<'info>,
    #[account(mut, seeds = [SEED_PERP_POOL], bump = pool.bump)]
    pub pool: Account<'info, PerpPool>,
    #[account(mut, seeds = [SEED_PERP_MARKET, &market.symbol], bump = market.bump)]
    pub market: Account<'info, PerpMarket>,
    #[account(mut)]
    pub account: Account<'info, PerpAccount>,
    #[account(mut, seeds = [SEED_PERP_ORDERS, account.owner.as_ref()], bump = orders.bump)]
    pub orders: Account<'info, PerpOrders>,
    pub price_update: Account<'info, PriceUpdateV2>,
}

/// Permissionless: fills an order once the market's pinned Pyth price crosses its trigger.
pub fn execute_perp_order(ctx: Context<ExecutePerpOrder>, index: u8) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let market_key = ctx.accounts.market.key();
    let m = &mut ctx.accounts.market;
    let o = *ctx.accounts.orders.orders.get(index as usize).ok_or(WickError::InvalidParams)?;
    require!(o.kind != PerpOrderKind::None && o.market_index == m.index, WickError::InvalidParams);
    m.accrue(now);
    let price = exec_price(&ctx.accounts.price_update, &m.oracle)?.price;
    let side = if o.is_long { PerpSide::Long } else { PerpSide::Short };
    let hit = match (o.kind, o.is_long) {
        (PerpOrderKind::LimitOpen, true) | (PerpOrderKind::StopLoss, true) | (PerpOrderKind::TakeProfit, false) => price <= o.trigger,
        (PerpOrderKind::LimitOpen, false) | (PerpOrderKind::StopLoss, false) | (PerpOrderKind::TakeProfit, true) => price >= o.trigger,
        _ => false,
    };
    require!(hit, WickError::TouchNotConfirmed);
    ctx.accounts.orders.orders[index as usize] = PerpOrder::default();
    let acc = &mut ctx.accounts.account;
    match o.kind {
        PerpOrderKind::LimitOpen => {
            acc.credit += o.collateral;
            open_inner(&mut ctx.accounts.pool, m, market_key, acc, side, o.collateral, o.leverage_x10, price, now)
        }
        _ if acc.slots[slot_index(m, side)].size == 0 => Ok(()),
        _ => close_at(&mut ctx.accounts.pool, m, market_key, acc, side, price, now, BPS),
    }
}

#[delegate]
#[derive(Accounts)]
pub struct DelegatePerpOrders<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: the payer's perp order book PDA; delegation changes its owner.
    #[account(mut, del, seeds = [SEED_PERP_ORDERS, payer.key().as_ref()], bump)]
    pub orders: UncheckedAccount<'info>,
}

pub fn delegate_perp_orders(ctx: Context<DelegatePerpOrders>) -> Result<()> {
    let payer = ctx.accounts.payer.key();
    ctx.accounts.delegate_orders(&ctx.accounts.payer, &[SEED_PERP_ORDERS, payer.as_ref()], DelegateConfig::default())?;
    Ok(())
}

/// The Arcium sealed program that owns encrypted stop orders.
pub const SEALED_PROGRAM_ID: Pubkey = pubkey!("8YY5NCZCPRcRy6tTPq3awnwW84LLe5LgECHNUNfx1wuT");
const STOP_DISCRIMINATOR: [u8; 8] = [224, 169, 41, 120, 31, 128, 83, 132];

#[derive(Accounts)]
pub struct CloseByStop<'info> {
    pub keeper: Signer<'info>,
    #[account(mut, seeds = [SEED_PERP_POOL], bump = pool.bump)]
    pub pool: Account<'info, PerpPool>,
    #[account(mut, seeds = [SEED_PERP_MARKET, &market.symbol], bump = market.bump)]
    pub market: Account<'info, PerpMarket>,
    #[account(mut)]
    pub account: Account<'info, PerpAccount>,
    pub price_update: Account<'info, PriceUpdateV2>,
    /// CHECK: StopOrder owned by the sealed program; parsed and validated in `close_by_stop`.
    pub stop: UncheckedAccount<'info>,
}

/// Permissionless. Closes a position whose encrypted stop the Arcium cluster reported as
/// crossed. Layout of StopOrder (after the 8-byte discriminator): owner 32 · symbol 16 ·
/// is_long 1 · pubkey 32 · nonce 16 · price_ct 32 · armed 1 · triggered 1 · set_at 8.
pub fn close_by_stop(ctx: Context<CloseByStop>, side: PerpSide) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let stop = &ctx.accounts.stop;
    require_keys_eq!(*stop.owner, SEALED_PROGRAM_ID, WickError::Unauthorized);
    let d = stop.try_borrow_data()?;
    require!(d.len() >= 147 && d[..8] == STOP_DISCRIMINATOR, WickError::Unauthorized);
    let owner = Pubkey::try_from(&d[8..40]).map_err(|_| WickError::Unauthorized)?;
    let symbol: [u8; 16] = d[40..56].try_into().map_err(|_| WickError::Unauthorized)?;
    let is_long = d[56] == 1;
    let (armed, triggered) = (d[137] == 1, d[138] == 1);
    let set_at = i64::from_le_bytes(d[139..147].try_into().map_err(|_| WickError::Unauthorized)?);
    let (expected, _) =
        Pubkey::find_program_address(&[b"stop", owner.as_ref(), &symbol, &[is_long as u8]], &SEALED_PROGRAM_ID);
    require_keys_eq!(expected, stop.key(), WickError::Unauthorized);
    drop(d);

    let market_key = ctx.accounts.market.key();
    let m = &mut ctx.accounts.market;
    let acc = &mut ctx.accounts.account;
    require_keys_eq!(owner, acc.owner, WickError::Unauthorized);
    require!(symbol == m.symbol && is_long == (side == PerpSide::Long), WickError::Unauthorized);
    require!(armed && triggered, WickError::TouchNotConfirmed);
    // A stop only applies to the position it was set on, not to one opened afterwards.
    let slot = acc.slots[slot_index(m, side)];
    require!(slot.size > 0 && slot.opened_at <= set_at, WickError::TicketState);

    m.accrue(now);
    let price = exec_price(&ctx.accounts.price_update, &m.oracle)?.price;
    close_at(&mut ctx.accounts.pool, m, market_key, acc, side, price, now, BPS)
}

#[derive(Accounts)]
pub struct Liquidate<'info> {
    pub keeper: Signer<'info>,
    #[account(mut, seeds = [SEED_PERP_POOL], bump = pool.bump)]
    pub pool: Account<'info, PerpPool>,
    #[account(mut, seeds = [SEED_PERP_MARKET, &market.symbol], bump = market.bump)]
    pub market: Account<'info, PerpMarket>,
    #[account(mut)]
    pub account: Account<'info, PerpAccount>,
    pub price_update: Account<'info, PriceUpdateV2>,
    /// CHECK: validated against the market's oracle spec in `read_switchboard`.
    pub sb_feed: UncheckedAccount<'info>,
}

/// Permissionless. Wick-proof: the position must be under maintenance at BOTH the pinned
/// Pyth price and the Switchboard quote, which must be fresh and close to each other.
pub fn liquidate_perp(ctx: Context<Liquidate>, side: PerpSide) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let m = &mut ctx.accounts.market;
    let pool = &mut ctx.accounts.pool;
    let acc = &mut ctx.accounts.account;
    m.accrue(now);
    let p = exec_price(&ctx.accounts.price_update, &m.oracle)?;
    let s_print = read_switchboard(&ctx.accounts.sb_feed, &m.oracle, &clock)?;
    require!(now - s_print.ts <= PERP_PRICE_MAX_AGE * 2, WickError::OracleStale);
    require!(
        gap_bps(p.price, s_print.price) <= m.oracle.max_dev_bps as u64,
        WickError::TouchNotConfirmed
    );

    let idx = slot_index(m, side);
    let mut s = acc.slots[idx];
    require!(s.size > 0, WickError::NothingToClaim);
    require!(
        is_liquidatable(&s, side, m, p.price)? && is_liquidatable(&s, side, m, s_print.price)?,
        WickError::TouchNotConfirmed
    );
    // Use the price that is kinder to the trader for what's left.
    let eq = equity(&s, side, m, p.price)?.max(equity(&s, side, m, s_print.price)?);
    let liq_fee = fee(s.size, m.liq_fee_bps);
    let refund = (eq - liq_fee as i64).max(0) as u64;
    pool.fees += s.collateral.min(liq_fee + fee(s.size, m.close_fee_bps));
    let size = s.size;
    settle_slot(pool, m, &mut s, side, refund);
    acc.slots[idx] = s;
    acc.credit += refund;
    emit!(Liquidated {
        owner: acc.owner,
        market: m.key(),
        side,
        size,
        pyth: p.price,
        switchboard: s_print.price,
        refund,
    });
    Ok(())
}

// ---------------------------------------------------------------- LP (ER)

#[derive(Accounts)]
pub struct PerpLp<'info> {
    pub signer: Signer<'info>,
    #[account(mut, seeds = [SEED_PERP_POOL], bump = pool.bump)]
    pub pool: Account<'info, PerpPool>,
    #[account(mut)]
    pub account: Account<'info, PerpAccount>,
    pub session: Option<Account<'info, Session>>,
}

pub fn lp_deposit(ctx: Context<PerpLp>, amount: u64) -> Result<()> {
    authorize(&ctx.accounts.signer.key(), &ctx.accounts.account.owner, &ctx.accounts.session)?;
    let pool = &mut ctx.accounts.pool;
    let acc = &mut ctx.accounts.account;
    require!(amount > 0 && amount <= acc.credit, WickError::InsufficientBalance);
    let shares = if pool.shares == 0 || pool.liquidity == 0 {
        amount
    } else {
        (amount as u128 * pool.shares as u128 / pool.liquidity as u128) as u64
    };
    require!(shares > 0, WickError::InvalidParams);
    acc.credit -= amount;
    acc.lp_shares += shares;
    pool.liquidity += amount;
    pool.shares += shares;
    Ok(())
}

/// Burns shares for USDC credit; only unreserved liquidity can leave.
pub fn lp_withdraw(ctx: Context<PerpLp>, shares: u64) -> Result<()> {
    authorize(&ctx.accounts.signer.key(), &ctx.accounts.account.owner, &ctx.accounts.session)?;
    let pool = &mut ctx.accounts.pool;
    let acc = &mut ctx.accounts.account;
    require!(shares > 0 && shares <= acc.lp_shares, WickError::InsufficientBalance);
    let amount = (shares as u128 * pool.liquidity as u128 / pool.shares as u128) as u64;
    require!(amount <= pool.free(), WickError::HouseCapacity);
    acc.lp_shares -= shares;
    acc.credit += amount;
    pool.shares -= shares;
    pool.liquidity -= amount;
    Ok(())
}

// ---------------------------------------------------------------- delegation

#[delegate]
#[derive(Accounts)]
pub struct DelegatePerpPool<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: perp pool PDA; delegation changes its owner.
    #[account(mut, del, seeds = [SEED_PERP_POOL], bump)]
    pub pool: UncheckedAccount<'info>,
}

pub fn delegate_perp_pool(ctx: Context<DelegatePerpPool>) -> Result<()> {
    ctx.accounts.delegate_pool(&ctx.accounts.payer, &[SEED_PERP_POOL], DelegateConfig::default())?;
    Ok(())
}

#[delegate]
#[derive(Accounts)]
#[instruction(symbol: [u8; 16])]
pub struct DelegatePerpMarket<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: perp market PDA; delegation changes its owner.
    #[account(mut, del, seeds = [SEED_PERP_MARKET, &symbol], bump)]
    pub market: UncheckedAccount<'info>,
}

pub fn delegate_perp_market(ctx: Context<DelegatePerpMarket>, symbol: [u8; 16]) -> Result<()> {
    ctx.accounts.delegate_market(&ctx.accounts.payer, &[SEED_PERP_MARKET, &symbol], DelegateConfig::default())?;
    Ok(())
}

#[delegate]
#[derive(Accounts)]
pub struct DelegatePerpAccount<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: the payer's perp account PDA; delegation changes its owner.
    #[account(mut, del, seeds = [SEED_PERP_ACCOUNT, payer.key().as_ref()], bump)]
    pub account: UncheckedAccount<'info>,
}

pub fn delegate_perp_account(ctx: Context<DelegatePerpAccount>) -> Result<()> {
    let payer = ctx.accounts.payer.key();
    ctx.accounts.delegate_account(&ctx.accounts.payer, &[SEED_PERP_ACCOUNT, payer.as_ref()], DelegateConfig::default())?;
    Ok(())
}

/// Runs on the ER: brings a trader's account back to base so they can withdraw.
#[commit]
#[derive(Accounts)]
pub struct UndelegatePerpAccount<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, constraint = account.owner == payer.key() @ WickError::Unauthorized)]
    pub account: Account<'info, PerpAccount>,
}

pub fn undelegate_perp_account(ctx: Context<UndelegatePerpAccount>) -> Result<()> {
    ctx.accounts.account.exit(&crate::ID)?;
    commit_and_undelegate_accounts(
        &ctx.accounts.payer,
        vec![&ctx.accounts.account.to_account_info()],
        &ctx.accounts.magic_context,
        &ctx.accounts.magic_program,
        None,
    )?;
    Ok(())
}

#[event]
pub struct PerpTradeEvent {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub side: PerpSide,
    pub is_open: bool,
    pub size: u64,
    pub price: i64,
    pub pnl: i64,
    pub ts: i64,
}

#[event]
pub struct Liquidated {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub side: PerpSide,
    pub size: u64,
    pub pyth: i64,
    pub switchboard: i64,
    pub refund: u64,
}
