use crate::error::WickError;
use crate::math::{fee_of, fpmm_buy, fpmm_sell};
use crate::ix::session::{authorize, Session};
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use ephemeral_rollups_sdk::anchor::{commit, delegate};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

// ---------------------------------------------------------------- base layer

#[derive(Accounts)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: only used as a seed; the market may already be delegated.
    pub market: UncheckedAccount<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + Position::INIT_SPACE,
        seeds = [SEED_POSITION, market.key().as_ref(), owner.key().as_ref()],
        bump,
    )]
    pub position: Account<'info, Position>,
    pub system_program: Program<'info, System>,
}

pub fn open_position(ctx: Context<OpenPosition>) -> Result<()> {
    ctx.accounts.position.set_inner(Position {
        owner: ctx.accounts.owner.key(),
        market: ctx.accounts.market.key(),
        balance: 0,
        yes: 0,
        no: 0,
        claimed: false,
        bump: ctx.bumps.position,
    });
    Ok(())
}

/// Moves USDC into the market vault and credits the position. Runs on base while the
/// position is undelegated; the market itself can stay on the ER.
#[derive(Accounts)]
pub struct Deposit<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner)]
    pub position: Account<'info, Position>,
    #[account(mut, seeds = [SEED_VAULT, position.market.as_ref()], bump, token::mint = mint)]
    pub vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = owner)]
    pub owner_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
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
    ctx.accounts.position.balance += amount;
    Ok(())
}

/// Withdraws unused USDC credit, and after resolution pays out winning shares.
/// Needs the market back on base so its status can be read.
#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner, has_one = market)]
    pub position: Account<'info, Position>,
    #[account(has_one = mint)]
    pub market: Account<'info, Market>,
    #[account(mut, seeds = [SEED_VAULT, market.key().as_ref()], bump = market.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = owner)]
    pub owner_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

fn pay_from_vault<'info>(
    market: &Account<'info, Market>,
    vault: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    let creator = market.creator;
    let id = market.market_id.to_le_bytes();
    let seeds: &[&[u8]] = &[SEED_MARKET, creator.as_ref(), &id, &[market.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            token_program.key(),
            Transfer {
                from: vault.to_account_info(),
                to: to.to_account_info(),
                authority: market.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )
}

pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    let pos = &mut ctx.accounts.position;
    require!(amount > 0 && amount <= pos.balance, WickError::InsufficientBalance);
    pos.balance -= amount;
    pay_from_vault(
        &ctx.accounts.market,
        &ctx.accounts.vault,
        &ctx.accounts.owner_token,
        &ctx.accounts.token_program,
        amount,
    )
}

/// Redeems a resolved position: winning shares pay 1 USDC, voided markets pay 0.5 per share.
pub fn claim(ctx: Context<Withdraw>) -> Result<()> {
    let market = &ctx.accounts.market;
    let pos = &mut ctx.accounts.position;
    require!(!pos.claimed, WickError::AlreadyClaimed);
    let winnings = match (market.status, market.outcome) {
        (MarketStatus::Settled, Some(Side::Yes)) => pos.yes,
        (MarketStatus::Settled, Some(Side::No)) => pos.no,
        (MarketStatus::Voided, _) => (pos.yes + pos.no) / 2,
        _ => return err!(WickError::MarketNotOpen),
    };
    let total = winnings + pos.balance;
    require!(total > 0, WickError::NothingToClaim);
    pos.claimed = true;
    pos.balance = 0;
    pos.yes = 0;
    pos.no = 0;
    pay_from_vault(
        market,
        &ctx.accounts.vault,
        &ctx.accounts.owner_token,
        &ctx.accounts.token_program,
        total,
    )
}

#[derive(Accounts)]
pub struct ClaimLp<'info> {
    pub creator: Signer<'info>,
    #[account(mut, has_one = creator, has_one = mint)]
    pub market: Account<'info, Market>,
    #[account(mut, seeds = [SEED_VAULT, market.key().as_ref()], bump = market.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = creator)]
    pub creator_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

/// The creator redeems the pool's own shares plus trading fees.
pub fn claim_lp(ctx: Context<ClaimLp>) -> Result<()> {
    let m = &ctx.accounts.market;
    require!(!m.lp_claimed, WickError::AlreadyClaimed);
    let pool = match (m.status, m.outcome) {
        (MarketStatus::Settled, Some(Side::Yes)) => m.yes_reserve,
        (MarketStatus::Settled, Some(Side::No)) => m.no_reserve,
        (MarketStatus::Voided, _) => (m.yes_reserve + m.no_reserve) / 2,
        _ => return err!(WickError::MarketNotOpen),
    };
    let total = pool + m.fees_accrued;
    pay_from_vault(
        m,
        &ctx.accounts.vault,
        &ctx.accounts.creator_token,
        &ctx.accounts.token_program,
        total,
    )?;
    ctx.accounts.market.lp_claimed = true;
    Ok(())
}

// ---------------------------------------------------------------- trading (ER or base)

/// Signed by the owner or their session key (see `session.rs`).
#[derive(Accounts)]
pub struct Trade<'info> {
    pub signer: Signer<'info>,
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(mut, has_one = market)]
    pub position: Account<'info, Position>,
    pub session: Option<Account<'info, Session>>,
}

fn check_tradable(m: &Market) -> Result<()> {
    require!(m.status == MarketStatus::Open, WickError::MarketNotOpen);
    require!(Clock::get()?.unix_timestamp < m.expiry, WickError::Expired);
    Ok(())
}

fn do_buy(m: &mut Account<Market>, pos: &mut Position, side: Side, amount: u64, min_shares: u64) -> Result<u64> {
    check_tradable(m)?;
    require!(amount > 0 && amount <= pos.balance, WickError::InsufficientBalance);
    let fee = fee_of(amount, m.fee_bps);
    let net = amount - fee;
    let shares = match side {
        Side::Yes => {
            let (out, y, n) = fpmm_buy(m.yes_reserve, m.no_reserve, net)?;
            m.yes_reserve = y;
            m.no_reserve = n;
            pos.yes += out;
            out
        }
        Side::No => {
            let (out, n, y) = fpmm_buy(m.no_reserve, m.yes_reserve, net)?;
            m.yes_reserve = y;
            m.no_reserve = n;
            pos.no += out;
            out
        }
    };
    require!(shares >= min_shares, WickError::Slippage);
    pos.balance -= amount;
    m.fees_accrued += fee;
    m.volume += amount;
    emit!(TradeEvent {
        market: m.key(),
        owner: pos.owner,
        side,
        is_buy: true,
        collateral: amount,
        shares,
        yes_price_bps: m.yes_price_bps(),
        ts: Clock::get()?.unix_timestamp,
    });
    Ok(shares)
}

fn do_sell(m: &mut Account<Market>, pos: &mut Position, side: Side, shares: u64, min_out: u64) -> Result<u64> {
    check_tradable(m)?;
    let gross = match side {
        Side::Yes => {
            require!(shares > 0 && shares <= pos.yes, WickError::InsufficientBalance);
            let (c, y, n) = fpmm_sell(m.yes_reserve, m.no_reserve, shares)?;
            m.yes_reserve = y;
            m.no_reserve = n;
            pos.yes -= shares;
            c
        }
        Side::No => {
            require!(shares > 0 && shares <= pos.no, WickError::InsufficientBalance);
            let (c, n, y) = fpmm_sell(m.no_reserve, m.yes_reserve, shares)?;
            m.yes_reserve = y;
            m.no_reserve = n;
            pos.no -= shares;
            c
        }
    };
    let fee = fee_of(gross, m.fee_bps);
    let out = gross - fee;
    require!(out >= min_out, WickError::Slippage);
    pos.balance += out;
    m.fees_accrued += fee;
    m.volume += gross;
    emit!(TradeEvent {
        market: m.key(),
        owner: pos.owner,
        side,
        is_buy: false,
        collateral: out,
        shares,
        yes_price_bps: m.yes_price_bps(),
        ts: Clock::get()?.unix_timestamp,
    });
    Ok(out)
}

pub fn buy(ctx: Context<Trade>, side: Side, amount: u64, min_shares: u64) -> Result<()> {
    authorize(&ctx.accounts.signer.key(), &ctx.accounts.position.owner, &ctx.accounts.session)?;
    do_buy(&mut ctx.accounts.market, &mut ctx.accounts.position, side, amount, min_shares).map(|_| ())
}

pub fn sell(ctx: Context<Trade>, side: Side, shares: u64, min_out: u64) -> Result<()> {
    authorize(&ctx.accounts.signer.key(), &ctx.accounts.position.owner, &ctx.accounts.session)?;
    do_sell(&mut ctx.accounts.market, &mut ctx.accounts.position, side, shares, min_out).map(|_| ())
}

// ---------------------------------------------------------------- limit orders (ER)

pub const SEED_POOL_ORDERS: &[u8] = b"pool_orders";
pub const POOL_ORDER_SLOTS: usize = 4;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, InitSpace)]
pub struct PoolOrder {
    pub active: bool,
    pub is_yes: bool,
    pub is_buy: bool,
    /// Escrowed USDC (buys) or shares (sells).
    pub amount: u64,
    /// Buy: fill when the side trades at or below this; sell: at or above. In bps (¢ × 100).
    pub limit_bps: u16,
}

#[account]
#[derive(InitSpace)]
pub struct PoolOrders {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub orders: [PoolOrder; POOL_ORDER_SLOTS],
    pub bump: u8,
}

#[derive(Accounts)]
pub struct OpenPoolOrders<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: only used as a seed; the market may be delegated.
    pub market: UncheckedAccount<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + PoolOrders::INIT_SPACE,
        seeds = [SEED_POOL_ORDERS, market.key().as_ref(), owner.key().as_ref()],
        bump,
    )]
    pub orders: Account<'info, PoolOrders>,
    pub system_program: Program<'info, System>,
}

pub fn open_pool_orders(ctx: Context<OpenPoolOrders>) -> Result<()> {
    ctx.accounts.orders.set_inner(PoolOrders {
        owner: ctx.accounts.owner.key(),
        market: ctx.accounts.market.key(),
        orders: [PoolOrder::default(); POOL_ORDER_SLOTS],
        bump: ctx.bumps.orders,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ManagePoolOrder<'info> {
    pub signer: Signer<'info>,
    pub market: Account<'info, Market>,
    #[account(mut, has_one = market)]
    pub position: Account<'info, Position>,
    #[account(mut, has_one = market, constraint = orders.owner == position.owner @ WickError::Unauthorized)]
    pub orders: Account<'info, PoolOrders>,
    pub session: Option<Account<'info, Session>>,
}

pub fn place_pool_order(ctx: Context<ManagePoolOrder>, is_yes: bool, is_buy: bool, amount: u64, limit_bps: u16) -> Result<()> {
    authorize(&ctx.accounts.signer.key(), &ctx.accounts.position.owner, &ctx.accounts.session)?;
    check_tradable(&ctx.accounts.market)?;
    require!(amount > 0 && limit_bps > 0 && (limit_bps as u64) < BPS, WickError::InvalidParams);
    let pos = &mut ctx.accounts.position;
    let book = &mut ctx.accounts.orders;
    let slot = book.orders.iter().position(|o| !o.active).ok_or(WickError::HouseCapacity)?;
    // Escrow what the order will spend so it can't be double-spent.
    let bal = match (is_buy, is_yes) {
        (true, _) => &mut pos.balance,
        (false, true) => &mut pos.yes,
        (false, false) => &mut pos.no,
    };
    require!(amount <= *bal, WickError::InsufficientBalance);
    *bal -= amount;
    book.orders[slot] = PoolOrder { active: true, is_yes, is_buy, amount, limit_bps };
    Ok(())
}

fn refund(pos: &mut Position, o: &PoolOrder) {
    match (o.is_buy, o.is_yes) {
        (true, _) => pos.balance += o.amount,
        (false, true) => pos.yes += o.amount,
        (false, false) => pos.no += o.amount,
    }
}

/// The owner can cancel anytime; anyone can after expiry, so escrow always returns before claims.
pub fn cancel_pool_order(ctx: Context<ManagePoolOrder>, index: u8) -> Result<()> {
    if Clock::get()?.unix_timestamp < ctx.accounts.market.expiry {
        authorize(&ctx.accounts.signer.key(), &ctx.accounts.position.owner, &ctx.accounts.session)?;
    }
    let o = ctx.accounts.orders.orders.get_mut(index as usize).ok_or(WickError::InvalidParams)?;
    require!(o.active, WickError::TicketState);
    refund(&mut ctx.accounts.position, o);
    *o = PoolOrder::default();
    Ok(())
}

#[derive(Accounts)]
pub struct ExecutePoolOrder<'info> {
    pub keeper: Signer<'info>,
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(mut, has_one = market)]
    pub position: Account<'info, Position>,
    #[account(mut, has_one = market, constraint = orders.owner == position.owner @ WickError::Unauthorized)]
    pub orders: Account<'info, PoolOrders>,
}

/// Permissionless: fills a limit order when the pool can do it at or better than its limit,
/// measured on the average fill price (so a big order can't walk past the limit).
pub fn execute_pool_order(ctx: Context<ExecutePoolOrder>, index: u8) -> Result<()> {
    let o = *ctx.accounts.orders.orders.get(index as usize).ok_or(WickError::InvalidParams)?;
    require!(o.active, WickError::TicketState);
    let side = if o.is_yes { Side::Yes } else { Side::No };
    let pos = &mut ctx.accounts.position;
    refund(pos, &o);
    ctx.accounts.orders.orders[index as usize] = PoolOrder::default();
    let m = &mut ctx.accounts.market;
    if o.is_buy {
        let shares = do_buy(m, pos, side, o.amount, 0)?;
        // avg price = amount / shares ≤ limit
        require!(o.amount as u128 * BPS as u128 <= shares as u128 * o.limit_bps as u128, WickError::Slippage);
    } else {
        let out = do_sell(m, pos, side, o.amount, 0)?;
        require!(out as u128 * BPS as u128 >= o.amount as u128 * o.limit_bps as u128, WickError::Slippage);
    }
    Ok(())
}

#[delegate]
#[derive(Accounts)]
pub struct DelegatePoolOrders<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: only used as a seed.
    pub market_key: UncheckedAccount<'info>,
    /// CHECK: the payer's order book PDA for this market; delegation changes its owner.
    #[account(mut, del, seeds = [SEED_POOL_ORDERS, market_key.key().as_ref(), payer.key().as_ref()], bump)]
    pub orders: UncheckedAccount<'info>,
}

pub fn delegate_pool_orders(ctx: Context<DelegatePoolOrders>) -> Result<()> {
    let market = ctx.accounts.market_key.key();
    let payer = ctx.accounts.payer.key();
    ctx.accounts.delegate_orders(&ctx.accounts.payer, &[SEED_POOL_ORDERS, market.as_ref(), payer.as_ref()], DelegateConfig::default())?;
    Ok(())
}

// ---------------------------------------------------------------- MagicBlock delegation

#[delegate]
#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct DelegateMarket<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: market PDA of `payer`; delegation changes its owner.
    #[account(mut, del, seeds = [SEED_MARKET, payer.key().as_ref(), &market_id.to_le_bytes()], bump)]
    pub market: UncheckedAccount<'info>,
}

pub fn delegate_market(ctx: Context<DelegateMarket>, market_id: u64) -> Result<()> {
    let payer = ctx.accounts.payer.key();
    ctx.accounts.delegate_market(
        &ctx.accounts.payer,
        &[SEED_MARKET, payer.as_ref(), &market_id.to_le_bytes()],
        DelegateConfig::default(),
    )?;
    Ok(())
}

#[delegate]
#[derive(Accounts)]
pub struct DelegatePosition<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: only used as a seed.
    pub market_key: UncheckedAccount<'info>,
    /// CHECK: position PDA of `payer`; delegation changes its owner.
    #[account(mut, del, seeds = [SEED_POSITION, market_key.key().as_ref(), payer.key().as_ref()], bump)]
    pub position: UncheckedAccount<'info>,
}

pub fn delegate_position(ctx: Context<DelegatePosition>) -> Result<()> {
    let market = ctx.accounts.market_key.key();
    let payer = ctx.accounts.payer.key();
    ctx.accounts.delegate_position(
        &ctx.accounts.payer,
        &[SEED_POSITION, market.as_ref(), payer.as_ref()],
        DelegateConfig::default(),
    )?;
    Ok(())
}

/// Runs on the ER. The creator can pull the market back anytime; anyone can after expiry
/// so settlement can never be blocked.
#[commit]
#[derive(Accounts)]
pub struct UndelegateMarket<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub market: Account<'info, Market>,
}

pub fn undelegate_market(ctx: Context<UndelegateMarket>) -> Result<()> {
    let m = &ctx.accounts.market;
    require!(
        m.creator == ctx.accounts.payer.key() || Clock::get()?.unix_timestamp >= m.expiry,
        WickError::Unauthorized
    );
    ctx.accounts.market.exit(&crate::ID)?;
    commit_and_undelegate_accounts(
        &ctx.accounts.payer,
        vec![&ctx.accounts.market.to_account_info()],
        &ctx.accounts.magic_context,
        &ctx.accounts.magic_program,
        None,
    )?;
    Ok(())
}

/// Runs on the ER. The owner can pull a position back anytime; anyone can after expiry.
#[commit]
#[derive(Accounts)]
pub struct UndelegatePosition<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub market: Account<'info, Market>,
    #[account(mut, has_one = market)]
    pub position: Account<'info, Position>,
}

pub fn undelegate_position(ctx: Context<UndelegatePosition>) -> Result<()> {
    require!(
        ctx.accounts.position.owner == ctx.accounts.payer.key()
            || Clock::get()?.unix_timestamp >= ctx.accounts.market.expiry,
        WickError::Unauthorized
    );
    ctx.accounts.position.exit(&crate::ID)?;
    commit_and_undelegate_accounts(
        &ctx.accounts.payer,
        vec![&ctx.accounts.position.to_account_info()],
        &ctx.accounts.magic_context,
        &ctx.accounts.magic_program,
        None,
    )?;
    Ok(())
}

#[event]
pub struct TradeEvent {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub side: Side,
    pub is_buy: bool,
    pub collateral: u64,
    pub shares: u64,
    pub yes_price_bps: u64,
    pub ts: i64,
}
