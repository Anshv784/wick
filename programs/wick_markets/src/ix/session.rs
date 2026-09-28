//! Session keys: the owner signs once on base to authorise a browser key, which then signs
//! trades on the ER. ER transactions never go through the wallet, so there are no wallet
//! popups (or simulation warnings, since wallets simulate against base) on every trade.

use crate::error::WickError;
use anchor_lang::prelude::*;

pub const SEED_SESSION: &[u8] = b"session";
/// Sessions last at most a week.
pub const MAX_SESSION_SECS: i64 = 7 * 86_400;

#[account]
#[derive(InitSpace)]
pub struct Session {
    pub owner: Pubkey,
    pub key: Pubkey,
    pub expires_at: i64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct SetSession<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Session::INIT_SPACE,
        seeds = [SEED_SESSION, owner.key().as_ref()],
        bump,
    )]
    pub session: Account<'info, Session>,
    pub system_program: Program<'info, System>,
}

pub fn set_session(ctx: Context<SetSession>, key: Pubkey, expires_at: i64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(expires_at > now && expires_at <= now + MAX_SESSION_SECS, WickError::InvalidParams);
    ctx.accounts.session.set_inner(Session {
        owner: ctx.accounts.owner.key(),
        key,
        expires_at,
        bump: ctx.bumps.session,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct RevokeSession<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner, close = owner, seeds = [SEED_SESSION, owner.key().as_ref()], bump = session.bump)]
    pub session: Account<'info, Session>,
}

pub fn revoke_session(_ctx: Context<RevokeSession>) -> Result<()> {
    Ok(())
}

/// Passes if `signer` is the owner, or holds the owner's live session key.
pub fn authorize(signer: &Pubkey, owner: &Pubkey, session: &Option<Account<Session>>) -> Result<()> {
    if signer == owner {
        return Ok(());
    }
    let s = session.as_ref().ok_or(WickError::Unauthorized)?;
    let (expected, _) = Pubkey::find_program_address(&[SEED_SESSION, owner.as_ref()], &crate::ID);
    require_keys_eq!(s.key(), expected, WickError::Unauthorized);
    require!(
        s.owner == *owner && s.key == *signer && Clock::get()?.unix_timestamp < s.expires_at,
        WickError::Unauthorized
    );
    Ok(())
}
