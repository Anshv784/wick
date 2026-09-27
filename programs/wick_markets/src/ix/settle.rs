use crate::error::WickError;
use crate::oracle::{gap_bps, read_pyth_pinned, read_switchboard, within};
use crate::state::*;
use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    pub price_update: Account<'info, PriceUpdateV2>,
    /// CHECK: validated against the market's oracle spec in `read_switchboard`.
    pub sb_feed: UncheckedAccount<'info>,
}

/// Permissionless. Both oracles must print inside the settlement window and land on the
/// same side of the strike within the allowed gap; otherwise the market freezes (and can be
/// retried until the window closes).
pub fn settle_market(ctx: Context<Settle>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let m = &mut ctx.accounts.market;
    // A frozen market can still settle while the window is open: freezing on one moment of
    // disagreement would let anyone time a print to force a 50/50 void.
    require!(
        m.status == MarketStatus::Open
            || (m.status == MarketStatus::Frozen && now <= m.expiry + SETTLE_WINDOW_SECS),
        WickError::MarketNotOpen
    );
    require!(now >= m.expiry, WickError::NotExpired);

    let p = read_pyth_pinned(&ctx.accounts.price_update, &m.oracle)?;
    let s = read_switchboard(&ctx.accounts.sb_feed, &m.oracle, &Clock::get()?)?;
    let (lo, hi) = (m.expiry, m.expiry + SETTLE_WINDOW_SECS);
    require!(within(&p, lo, hi) && within(&s, lo, hi), WickError::OracleStale);

    let yes_p = p.price >= m.strike;
    let yes_s = s.price >= m.strike;
    let agree = yes_p == yes_s && gap_bps(p.price, s.price) <= m.oracle.max_dev_bps as u64;

    m.settle_pyth = p.price;
    m.settle_sb = s.price;
    m.resolved_at = now;
    if agree {
        m.status = MarketStatus::Settled;
        m.outcome = Some(if yes_p { Side::Yes } else { Side::No });
    } else {
        m.status = MarketStatus::Frozen;
    }
    emit!(MarketResolved {
        market: m.key(),
        status: m.status,
        outcome: m.outcome,
        pyth: p.price,
        switchboard: s.price,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct Void<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
}

/// Permissionless escape hatch: a frozen market, or one nobody could settle, becomes
/// redeemable at 0.5 per share after the void delay.
pub fn void_market(ctx: Context<Void>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let m = &mut ctx.accounts.market;
    let since = match m.status {
        MarketStatus::Frozen => m.resolved_at,
        MarketStatus::Open => m.expiry,
        _ => return err!(WickError::MarketNotOpen),
    };
    require!(now >= since + VOID_DELAY_SECS, WickError::VoidTooEarly);
    m.status = MarketStatus::Voided;
    m.resolved_at = now;
    emit!(MarketResolved {
        market: m.key(),
        status: m.status,
        outcome: None,
        pyth: m.settle_pyth,
        switchboard: m.settle_sb,
    });
    Ok(())
}

#[event]
pub struct MarketResolved {
    pub market: Pubkey,
    pub status: MarketStatus,
    pub outcome: Option<Side>,
    pub pyth: i64,
    pub switchboard: i64,
}
