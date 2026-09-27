use crate::error::WickError;
use crate::math::{payout_for, touch_fair_bps, touch_quote_bps};
use crate::oracle::{gap_bps, read_pyth, read_pyth_pinned, read_switchboard, Print};
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BuyTicketArgs {
    pub kind: TouchKind,
    pub barrier: i64,
    pub barrier2: i64,
    pub stake: u64,
    /// Reject if the quote is worse (higher) than this.
    pub max_price_bps: u16,
}

#[derive(Accounts)]
pub struct BuyTicket<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, has_one = mint)]
    pub book: Account<'info, TouchBook>,
    #[account(
        init,
        payer = owner,
        space = 8 + TouchTicket::INIT_SPACE,
        seeds = [SEED_TICKET, book.key().as_ref(), &book.ticket_count.to_le_bytes()],
        bump,
    )]
    pub ticket: Account<'info, TouchTicket>,
    #[account(mut, seeds = [SEED_TOUCH_VAULT, book.key().as_ref()], bump = book.vault_bump)]
    pub touch_vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = owner)]
    pub owner_token: Account<'info, TokenAccount>,
    pub price_update: Account<'info, PriceUpdateV2>,
    /// CHECK: validated against the book's oracle spec in `read_switchboard`.
    pub sb_feed: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn buy_ticket(ctx: Context<BuyTicket>, args: BuyTicketArgs) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let book = &mut ctx.accounts.book;
    require!(now + 60 < book.expiry, WickError::Expired);
    require!(args.stake >= SHARE_UNIT / 10, WickError::InvalidParams);

    let clock = Clock::get()?;
    let p = read_pyth_pinned(&ctx.accounts.price_update, &book.oracle)?;
    let s = read_switchboard(&ctx.accounts.sb_feed, &book.oracle, &clock)?;
    require!(
        (0..=QUOTE_MAX_AGE_SECS as i64).contains(&(now - p.ts)) && now - s.ts <= QUOTE_SB_MAX_AGE_SECS,
        WickError::OracleStale
    );
    // Quote off whichever oracle is closer to the barrier, so a stale print can't be used
    // to buy a touch that has effectively already happened.
    let spot = Print {
        price: match args.kind {
            TouchKind::Up | TouchKind::UpBeforeDown => p.price.max(s.price),
            TouchKind::Down => p.price.min(s.price),
        },
        ts: p.ts,
    };

    let fair = touch_fair_bps(
        args.kind,
        spot.price,
        args.barrier,
        args.barrier2,
        book.vol_bps,
        book.expiry - now,
    )?;
    let price_bps = touch_quote_bps(fair, book.margin_bps)?;
    require!(price_bps <= args.max_price_bps as u64, WickError::Slippage);
    let payout = payout_for(args.stake, price_bps)?;
    require!(payout <= book.max_payout, WickError::HouseCapacity);
    let house_risk = payout - args.stake;
    require!(house_risk <= book.free, WickError::HouseCapacity);

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.owner_token.to_account_info(),
                to: ctx.accounts.touch_vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        args.stake,
    )?;

    book.free -= house_risk;
    book.locked += payout;
    let id = book.ticket_count;
    book.ticket_count += 1;

    ctx.accounts.ticket.set_inner(TouchTicket {
        book: book.key(),
        owner: ctx.accounts.owner.key(),
        id,
        kind: args.kind,
        barrier: args.barrier,
        barrier2: args.barrier2,
        spot: spot.price,
        stake: args.stake,
        payout,
        price_bps: price_bps as u16,
        created_at: now,
        status: TicketStatus::Open,
        hit_pyth: 0,
        hit_sb: 0,
        hit_at: 0,
        bump: ctx.bumps.ticket,
    });
    emit!(TicketBought {
        book: book.key(),
        ticket: ctx.accounts.ticket.key(),
        owner: ctx.accounts.owner.key(),
        kind: args.kind,
        barrier: args.barrier,
        barrier2: args.barrier2,
        stake: args.stake,
        payout,
        price_bps: price_bps as u16,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ConfirmTouch<'info> {
    #[account(mut)]
    pub book: Account<'info, TouchBook>,
    #[account(mut, has_one = book)]
    pub ticket: Account<'info, TouchTicket>,
    pub price_update: Account<'info, PriceUpdateV2>,
    /// CHECK: validated against the book's oracle spec in `read_switchboard`.
    pub sb_feed: UncheckedAccount<'info>,
}

enum Verdict {
    Won,
    Lost,
}

fn judge(t: &TouchTicket, a: i64, b: i64) -> Option<Verdict> {
    let both_at_or_above = |lvl: i64| a >= lvl && b >= lvl;
    let both_at_or_below = |lvl: i64| a <= lvl && b <= lvl;
    match t.kind {
        TouchKind::Up if both_at_or_above(t.barrier) => Some(Verdict::Won),
        TouchKind::Down if both_at_or_below(t.barrier) => Some(Verdict::Won),
        TouchKind::UpBeforeDown if both_at_or_above(t.barrier) => Some(Verdict::Won),
        TouchKind::UpBeforeDown if both_at_or_below(t.barrier2) => Some(Verdict::Lost),
        _ => None,
    }
}

/// Permissionless. A touch counts only when Pyth and Switchboard both print through the
/// level, close together in time, after the ticket was bought and before expiry. Any
/// Wormhole-verified Pyth print is accepted here (not just the push feed) so a short wick
/// between keeper cranks can still be proven; the canonical Switchboard quote must agree.
pub fn confirm_touch(ctx: Context<ConfirmTouch>) -> Result<()> {
    let book = &mut ctx.accounts.book;
    let t = &mut ctx.accounts.ticket;
    require!(t.status == TicketStatus::Open, WickError::TicketState);

    let p: Print = read_pyth(&ctx.accounts.price_update, &book.oracle)?;
    let s: Print = read_switchboard(&ctx.accounts.sb_feed, &book.oracle, &Clock::get()?)?;
    // The Pyth print must fall inside the ticket's life; the Switchboard quote may land up to
    // TOUCH_SYNC_SECS after it, so a touch just before expiry can still be proven.
    require!(
        p.ts >= t.created_at && p.ts <= book.expiry && s.ts >= t.created_at,
        WickError::OracleStale
    );
    require!((p.ts - s.ts).abs() <= TOUCH_SYNC_SECS, WickError::OracleStale);
    if t.kind == TouchKind::UpBeforeDown {
        let now = Clock::get()?.unix_timestamp;
        require!(
            now - p.ts <= ORDERED_FRESH_SECS && now - s.ts <= ORDERED_FRESH_SECS,
            WickError::OracleStale
        );
    }
    require!(
        gap_bps(p.price, s.price) <= book.oracle.max_dev_bps as u64,
        WickError::TouchNotConfirmed
    );

    match judge(t, p.price, s.price).ok_or(WickError::TouchNotConfirmed)? {
        Verdict::Won => t.status = TicketStatus::Won,
        Verdict::Lost => {
            t.status = TicketStatus::Lost;
            book.locked -= t.payout;
            book.free += t.payout;
        }
    }
    t.hit_pyth = p.price;
    t.hit_sb = s.price;
    t.hit_at = p.ts.max(s.ts);
    emit!(TouchConfirmed {
        ticket: t.key(),
        won: t.status == TicketStatus::Won,
        pyth: p.price,
        switchboard: s.price,
        ts: t.hit_at,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ExpireTicket<'info> {
    #[account(mut)]
    pub book: Account<'info, TouchBook>,
    #[account(mut, has_one = book)]
    pub ticket: Account<'info, TouchTicket>,
}

/// After expiry plus the confirmation window, an unconfirmed ticket loses and its
/// reserved payout returns to the house.
pub fn expire_ticket(ctx: Context<ExpireTicket>) -> Result<()> {
    let book = &mut ctx.accounts.book;
    let t = &mut ctx.accounts.ticket;
    require!(t.status == TicketStatus::Open, WickError::TicketState);
    require!(
        Clock::get()?.unix_timestamp > book.expiry + TOUCH_GRACE_SECS,
        WickError::NotExpired
    );
    t.status = TicketStatus::Lost;
    book.locked -= t.payout;
    book.free += t.payout;
    Ok(())
}

#[derive(Accounts)]
pub struct ClaimTicket<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = mint)]
    pub book: Account<'info, TouchBook>,
    #[account(mut, has_one = book, has_one = owner)]
    pub ticket: Account<'info, TouchTicket>,
    #[account(mut, seeds = [SEED_TOUCH_VAULT, book.key().as_ref()], bump = book.vault_bump)]
    pub touch_vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = owner)]
    pub owner_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn claim_ticket(ctx: Context<ClaimTicket>) -> Result<()> {
    let book = &ctx.accounts.book;
    let t = &ctx.accounts.ticket;
    require!(t.status == TicketStatus::Won, WickError::TicketState);
    let market = book.market;
    let seeds: &[&[u8]] = &[SEED_BOOK, market.as_ref(), &[book.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.touch_vault.to_account_info(),
                to: ctx.accounts.owner_token.to_account_info(),
                authority: ctx.accounts.book.to_account_info(),
            },
            &[seeds],
        ),
        t.payout,
    )?;
    let payout = t.payout;
    ctx.accounts.book.locked -= payout;
    ctx.accounts.ticket.status = TicketStatus::Claimed;
    Ok(())
}

#[event]
pub struct TicketBought {
    pub book: Pubkey,
    pub ticket: Pubkey,
    pub owner: Pubkey,
    pub kind: TouchKind,
    pub barrier: i64,
    pub barrier2: i64,
    pub stake: u64,
    pub payout: u64,
    pub price_bps: u16,
}

#[event]
pub struct TouchConfirmed {
    pub ticket: Pubkey,
    pub won: bool,
    pub pyth: i64,
    pub switchboard: i64,
    pub ts: i64,
}
