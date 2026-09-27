use crate::error::WickError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateMarketArgs {
    pub market_id: u64,
    pub symbol: [u8; 16],
    pub oracle: OracleSpec,
    pub strike: i64,
    pub expiry: i64,
    pub fee_bps: u16,
    /// USDC the creator seeds into the pool; mints this many YES and NO shares.
    pub liquidity: u64,
}

#[derive(Accounts)]
#[instruction(args: CreateMarketArgs)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + Market::INIT_SPACE,
        seeds = [SEED_MARKET, creator.key().as_ref(), &args.market_id.to_le_bytes()],
        bump,
    )]
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = creator,
        seeds = [SEED_VAULT, market.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = market,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = creator)]
    pub creator_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn create_market(ctx: Context<CreateMarket>, args: CreateMarketArgs) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(args.expiry > now + 60, WickError::InvalidParams);
    require!(args.strike > 0, WickError::InvalidParams);
    require!(args.fee_bps <= 500, WickError::InvalidParams);
    require!(args.liquidity >= SHARE_UNIT, WickError::InvalidParams);
    require!(
        args.oracle.max_dev_bps > 0 && args.oracle.max_dev_bps <= 500,
        WickError::InvalidParams
    );

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.creator_token.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.creator.to_account_info(),
            },
        ),
        args.liquidity,
    )?;

    let m = &mut ctx.accounts.market;
    m.set_inner(Market {
        creator: ctx.accounts.creator.key(),
        market_id: args.market_id,
        mint: ctx.accounts.mint.key(),
        symbol: args.symbol,
        oracle: args.oracle,
        strike: args.strike,
        expiry: args.expiry,
        fee_bps: args.fee_bps,
        status: MarketStatus::Open,
        outcome: None,
        yes_reserve: args.liquidity,
        no_reserve: args.liquidity,
        fees_accrued: 0,
        lp_claimed: false,
        volume: 0,
        settle_pyth: 0,
        settle_sb: 0,
        resolved_at: 0,
        bump: ctx.bumps.market,
        vault_bump: ctx.bumps.vault,
    });
    emit!(MarketCreated {
        market: m.key(),
        creator: m.creator,
        strike: m.strike,
        expiry: m.expiry,
    });
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateBookArgs {
    pub vol_bps: u32,
    pub margin_bps: u16,
    pub max_payout: u64,
    pub funding: u64,
}

/// Opens the touch book for a market. Must run before the market is delegated, since it
/// copies the oracle spec and expiry out of the market account.
#[derive(Accounts)]
pub struct CreateTouchBook<'info> {
    #[account(mut)]
    pub house: Signer<'info>,
    #[account(has_one = mint, constraint = market.creator == house.key() @ WickError::Unauthorized)]
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = house,
        space = 8 + TouchBook::INIT_SPACE,
        seeds = [SEED_BOOK, market.key().as_ref()],
        bump,
    )]
    pub book: Account<'info, TouchBook>,
    #[account(
        init,
        payer = house,
        seeds = [SEED_TOUCH_VAULT, book.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = book,
    )]
    pub touch_vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = house)]
    pub house_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn create_touch_book(ctx: Context<CreateTouchBook>, args: CreateBookArgs) -> Result<()> {
    require!(
        args.vol_bps >= 500 && args.vol_bps <= 50_000,
        WickError::InvalidParams
    );
    require!(args.margin_bps <= 3_000, WickError::InvalidParams);
    require!(args.max_payout > 0, WickError::InvalidParams);

    if args.funding > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.house_token.to_account_info(),
                    to: ctx.accounts.touch_vault.to_account_info(),
                    authority: ctx.accounts.house.to_account_info(),
                },
            ),
            args.funding,
        )?;
    }

    let market = &ctx.accounts.market;
    ctx.accounts.book.set_inner(TouchBook {
        market: market.key(),
        house: ctx.accounts.house.key(),
        mint: market.mint,
        oracle: market.oracle,
        expiry: market.expiry,
        vol_bps: args.vol_bps,
        margin_bps: args.margin_bps,
        max_payout: args.max_payout,
        free: args.funding,
        locked: 0,
        ticket_count: 0,
        bump: ctx.bumps.book,
        vault_bump: ctx.bumps.touch_vault,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct HouseFunds<'info> {
    pub house: Signer<'info>,
    #[account(mut, has_one = house, has_one = mint)]
    pub book: Account<'info, TouchBook>,
    #[account(mut, seeds = [SEED_TOUCH_VAULT, book.key().as_ref()], bump = book.vault_bump)]
    pub touch_vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = house)]
    pub house_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn fund_house(ctx: Context<HouseFunds>, amount: u64) -> Result<()> {
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.house_token.to_account_info(),
                to: ctx.accounts.touch_vault.to_account_info(),
                authority: ctx.accounts.house.to_account_info(),
            },
        ),
        amount,
    )?;
    ctx.accounts.book.free += amount;
    Ok(())
}

/// The house can pull capital that is not backing any open ticket.
pub fn withdraw_house(ctx: Context<HouseFunds>, amount: u64) -> Result<()> {
    let book = &ctx.accounts.book;
    require!(amount <= book.free, WickError::InsufficientBalance);
    let market = book.market;
    let seeds: &[&[u8]] = &[SEED_BOOK, market.as_ref(), &[book.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.touch_vault.to_account_info(),
                to: ctx.accounts.house_token.to_account_info(),
                authority: ctx.accounts.book.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )?;
    ctx.accounts.book.free -= amount;
    Ok(())
}

#[event]
pub struct MarketCreated {
    pub market: Pubkey,
    pub creator: Pubkey,
    pub strike: i64,
    pub expiry: i64,
}
