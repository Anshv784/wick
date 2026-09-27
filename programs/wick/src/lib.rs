//! Wick sealed batch: encrypted YES/NO orders for a Wick market, cleared by Arcium MPC at
//! one uniform price. Only the batch totals and, after settlement, each order's payout are
//! ever revealed.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;
use wick_markets::{Market, MarketStatus, Side};

const COMP_DEF_OFFSET_INIT_TOTALS: u32 = comp_def_offset("init_totals");
const COMP_DEF_OFFSET_PLACE_ORDER: u32 = comp_def_offset("place_order");
const COMP_DEF_OFFSET_REVEAL_TOTALS: u32 = comp_def_offset("reveal_totals");
const COMP_DEF_OFFSET_REVEAL_ORDER: u32 = comp_def_offset("reveal_order");

pub const SEED_BATCH: &[u8] = b"batch";
pub const SEED_BATCH_VAULT: &[u8] = b"batch_vault";
pub const SEED_ORDER: &[u8] = b"order";
/// A computation that never called back releases the batch lock after this long.
const LOCK_TIMEOUT_SECS: i64 = 180;
const MIN_DEPOSIT: u64 = 100_000;
/// Totals are only revealed with at least this many orders; below it, revealing the totals
/// would leak individual sides and sizes, so the batch is cancelled and fully refunded.
const MIN_REVEAL_ORDERS: u32 = 3;

declare_id!("8YY5NCZCPRcRy6tTPq3awnwW84LLe5LgECHNUNfx1wuT");

#[arcium_program]
pub mod wick {
    use super::*;

    // ------------------------------------------------------------ comp defs

    pub fn init_init_totals_comp_def(ctx: Context<InitInitTotalsCompDef>) -> Result<()> {
        init_computation_def(ctx.accounts, None)?;
        Ok(())
    }

    pub fn init_place_order_comp_def(ctx: Context<InitPlaceOrderCompDef>) -> Result<()> {
        init_computation_def(ctx.accounts, None)?;
        Ok(())
    }

    pub fn init_reveal_totals_comp_def(ctx: Context<InitRevealTotalsCompDef>) -> Result<()> {
        init_computation_def(ctx.accounts, None)?;
        Ok(())
    }

    pub fn init_reveal_order_comp_def(ctx: Context<InitRevealOrderCompDef>) -> Result<()> {
        init_computation_def(ctx.accounts, None)?;
        Ok(())
    }

    // ------------------------------------------------------------ batch lifecycle

    /// Opens a sealed batch for a Wick market. Orders are accepted until `close_ts`.
    pub fn create_batch(
        ctx: Context<CreateBatch>,
        computation_offset: u64,
        close_ts: i64,
    ) -> Result<()> {
        let market = load_market(&ctx.accounts.market)?;
        let now = Clock::get()?.unix_timestamp;
        require!(close_ts > now && close_ts <= market.expiry, SealedError::InvalidParams);
        require_keys_eq!(market.mint, ctx.accounts.mint.key(), SealedError::InvalidParams);
        require_keys_eq!(market.creator, ctx.accounts.payer.key(), SealedError::Unauthorized);

        let b = &mut ctx.accounts.batch;
        b.market = ctx.accounts.market.key();
        b.mint = market.mint;
        b.close_ts = close_ts;
        b.state = BatchState::Initializing;
        b.busy_since = now;
        b.bump = ctx.bumps.batch;
        b.vault_bump = ctx.bumps.batch_vault;

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
        let batch_key = ctx.accounts.batch.key();
        queue_computation(
            ctx.accounts,
            computation_offset,
            ArgBuilder::new().build(),
            vec![InitTotalsCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[CallbackAccount { pubkey: batch_key, is_writable: true }],
            )?],
            1,
            0,
            0,
        )?;
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "init_totals")]
    pub fn init_totals_callback(
        ctx: Context<InitTotalsCallback>,
        output: SignedComputationOutputs<InitTotalsOutput>,
    ) -> Result<()> {
        let o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(InitTotalsOutput { field_0 }) => field_0,
            Err(_) => return Err(SealedError::AbortedComputation.into()),
        };
        let b = &mut ctx.accounts.batch;
        b.totals_ct = o.ciphertexts;
        b.totals_nonce = o.nonce;
        b.state = BatchState::Open;
        b.busy_since = 0;
        Ok(())
    }

    /// Escrows `deposit` USDC and queues an encrypted order (side + size). The size is
    /// clamped to the deposit inside MPC, so observers learn only the upper bound.
    pub fn place_order(
        ctx: Context<PlaceOrder>,
        computation_offset: u64,
        side_ct: [u8; 32],
        amount_ct: [u8; 32],
        pubkey: [u8; 32],
        nonce: u128,
        deposit: u64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let b = &mut ctx.accounts.batch;
        require!(b.state == BatchState::Open && now < b.close_ts, SealedError::BatchClosed);
        require!(
            b.busy_since == 0 || now > b.busy_since + LOCK_TIMEOUT_SECS,
            SealedError::BatchBusy
        );
        require!(deposit >= MIN_DEPOSIT, SealedError::InvalidParams);
        b.busy_since = now;
        b.pending_order = ctx.accounts.order.key();
        b.escrowed += deposit;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.owner_token.to_account_info(),
                    to: ctx.accounts.batch_vault.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            deposit,
        )?;

        let o = &mut ctx.accounts.order;
        o.batch = ctx.accounts.batch.key();
        o.owner = ctx.accounts.payer.key();
        o.deposit = deposit;
        o.state = OrderState::Pending;
        o.bump = ctx.bumps.order;

        let batch = &ctx.accounts.batch;
        let args = ArgBuilder::new()
            .x25519_pubkey(pubkey)
            .plaintext_u128(nonce)
            .encrypted_bool(side_ct)
            .encrypted_u64(amount_ct)
            .plaintext_u64(deposit)
            .plaintext_u128(batch.totals_nonce)
            .account(batch.key(), 8, 64)
            .build();

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
        let batch_key = ctx.accounts.batch.key();
        let order_key = ctx.accounts.order.key();
        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![PlaceOrderCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[
                    CallbackAccount { pubkey: batch_key, is_writable: true },
                    CallbackAccount { pubkey: order_key, is_writable: true },
                ],
            )?],
            1,
            0,
            0,
        )?;
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "place_order")]
    pub fn place_order_callback(
        ctx: Context<PlaceOrderCallback>,
        output: SignedComputationOutputs<PlaceOrderOutput>,
    ) -> Result<()> {
        let o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(PlaceOrderOutput { field_0 }) => field_0,
            Err(_) => return Err(SealedError::AbortedComputation.into()),
        };
        let b = &mut ctx.accounts.batch;
        let ord = &mut ctx.accounts.order;
        // A callback that arrives after its lock was taken over (or the order was cancelled)
        // was computed from stale totals; drop it.
        require!(
            b.state == BatchState::Open && b.pending_order == ord.key() && ord.state == OrderState::Pending,
            SealedError::OrderState
        );
        b.totals_ct = o.field_0.ciphertexts;
        b.totals_nonce = o.field_0.nonce;
        b.busy_since = 0;
        b.pending_order = Pubkey::default();
        b.order_count += 1;
        ord.order_ct = o.field_1.ciphertexts;
        ord.order_nonce = o.field_1.nonce;
        ord.state = OrderState::Placed;
        emit!(SealedOrderPlaced { batch: b.key(), order: ord.key(), deposit: ord.deposit });
        Ok(())
    }

    /// If an order's computation never called back, its owner can take the deposit back
    /// once the lock has timed out. The totals never included it.
    pub fn cancel_stuck_order(ctx: Context<CancelStuckOrder>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let b = &mut ctx.accounts.batch;
        let o = &mut ctx.accounts.order;
        require!(o.state == OrderState::Pending, SealedError::OrderState);
        require!(
            b.pending_order != o.key() || now > b.busy_since + LOCK_TIMEOUT_SECS,
            SealedError::BatchBusy
        );
        if b.pending_order == o.key() {
            b.busy_since = 0;
            b.pending_order = Pubkey::default();
        }
        b.escrowed -= o.deposit;
        o.state = OrderState::Paid;
        o.payout = o.deposit;
        pay_out(
            &ctx.accounts.batch,
            &ctx.accounts.batch_vault,
            &ctx.accounts.owner_token,
            &ctx.accounts.token_program,
            o.deposit,
        )
    }

    /// After the close time, reveals only the aggregate YES and NO totals.
    pub fn reveal_batch(ctx: Context<RevealBatch>, computation_offset: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let b = &mut ctx.accounts.batch;
        require!(b.state == BatchState::Open && now >= b.close_ts, SealedError::BatchOpen);
        require!(
            b.busy_since == 0 || now > b.busy_since + LOCK_TIMEOUT_SECS,
            SealedError::BatchBusy
        );
        if b.order_count < MIN_REVEAL_ORDERS {
            b.state = BatchState::Cancelled;
            emit!(BatchRevealed { batch: b.key(), yes_total: 0, no_total: 0 });
            return Ok(());
        }
        b.state = BatchState::Revealing;
        let args = ArgBuilder::new()
            .plaintext_u128(b.totals_nonce)
            .account(b.key(), 8, 64)
            .build();

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
        let batch_key = ctx.accounts.batch.key();
        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![RevealTotalsCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[CallbackAccount { pubkey: batch_key, is_writable: true }],
            )?],
            1,
            0,
            0,
        )?;
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "reveal_totals")]
    pub fn reveal_totals_callback(
        ctx: Context<RevealTotalsCallback>,
        output: SignedComputationOutputs<RevealTotalsOutput>,
    ) -> Result<()> {
        let o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(RevealTotalsOutput { field_0 }) => field_0,
            Err(_) => return Err(SealedError::AbortedComputation.into()),
        };
        let b = &mut ctx.accounts.batch;
        require!(b.state == BatchState::Revealing, SealedError::BatchOpen);
        b.yes_total = o.field_0;
        b.no_total = o.field_1;
        b.state = BatchState::Revealed;
        emit!(BatchRevealed { batch: b.key(), yes_total: b.yes_total, no_total: b.no_total });
        Ok(())
    }

    /// Once the Wick market is settled or voided, opens this order in MPC so it can be paid.
    /// Can be re-queued if a previous computation never called back.
    pub fn settle_order(ctx: Context<SettleOrder>, computation_offset: u64) -> Result<()> {
        require!(ctx.accounts.batch.state == BatchState::Revealed, SealedError::BatchOpen);
        let st = ctx.accounts.order.state;
        require!(
            st == OrderState::Placed || st == OrderState::Settling,
            SealedError::OrderState
        );
        resolution(&ctx.accounts.market)?;

        let ord = &mut ctx.accounts.order;
        ord.state = OrderState::Settling;
        let args = ArgBuilder::new()
            .plaintext_u128(ord.order_nonce)
            .account(ord.key(), 8, 64)
            .build();

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
        let order_key = ctx.accounts.order.key();
        let batch_key = ctx.accounts.batch.key();
        let market_key = ctx.accounts.market.key();
        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![RevealOrderCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[
                    CallbackAccount { pubkey: order_key, is_writable: true },
                    CallbackAccount { pubkey: batch_key, is_writable: false },
                    CallbackAccount { pubkey: market_key, is_writable: false },
                ],
            )?],
            1,
            0,
            0,
        )?;
        Ok(())
    }

    /// Winners split the whole batch pro rata (the same as buying shares at the clearing
    /// price); unused deposit comes back. A void market or one-sided batch refunds in full.
    #[arcium_callback(encrypted_ix = "reveal_order")]
    pub fn reveal_order_callback(
        ctx: Context<RevealOrderCallback>,
        output: SignedComputationOutputs<RevealOrderOutput>,
    ) -> Result<()> {
        let o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(RevealOrderOutput { field_0 }) => field_0,
            Err(_) => return Err(SealedError::AbortedComputation.into()),
        };
        let (yes, amount) = (o.field_0, o.field_1);
        let b = &ctx.accounts.batch;
        let ord = &mut ctx.accounts.order;
        require!(ord.state == OrderState::Settling, SealedError::OrderState);
        require_keys_eq!(ord.batch, b.key(), SealedError::InvalidParams);
        require_keys_eq!(b.market, ctx.accounts.market.key(), SealedError::InvalidParams);
        let (yes_won, voided) = resolution(&ctx.accounts.market)?;

        let amount = amount.min(ord.deposit);
        let (yes_total, no_total) = (b.yes_total as u128, b.no_total as u128);
        ord.payout = if voided || yes_total == 0 || no_total == 0 {
            ord.deposit
        } else {
            let side_total = if yes { yes_total } else { no_total };
            let winnings = if yes == yes_won {
                amount as u128 * (yes_total + no_total) / side_total
            } else {
                0
            };
            u64::try_from(winnings).map_err(|_| SealedError::InvalidParams)? + (ord.deposit - amount)
        };
        ord.state = OrderState::Settled;
        Ok(())
    }

    pub fn withdraw_payout(ctx: Context<WithdrawPayout>) -> Result<()> {
        let cancelled = ctx.accounts.batch.state == BatchState::Cancelled;
        let o = &mut ctx.accounts.order;
        if cancelled && o.state == OrderState::Placed {
            o.payout = o.deposit;
        } else {
            require!(o.state == OrderState::Settled, SealedError::OrderState);
        }
        o.state = OrderState::Paid;
        let amount = o.payout;
        pay_out(
            &ctx.accounts.batch,
            &ctx.accounts.batch_vault,
            &ctx.accounts.owner_token,
            &ctx.accounts.token_program,
            amount,
        )
    }
}

/// Market outcome as (yes_won, voided). The market must be back on base and resolved.
fn resolution(info: &AccountInfo) -> Result<(bool, bool)> {
    require!(*info.owner == wick_markets::ID, SealedError::MarketNotResolved);
    let market = load_market(info)?;
    match (market.status, market.outcome) {
        (MarketStatus::Settled, Some(side)) => Ok((side == Side::Yes, false)),
        (MarketStatus::Voided, _) => Ok((false, true)),
        _ => err!(SealedError::MarketNotResolved),
    }
}

fn load_market(info: &AccountInfo) -> Result<Market> {
    let data = info.try_borrow_data()?;
    let market = Market::try_deserialize(&mut &data[..])?;
    let id = market.market_id.to_le_bytes();
    let expected = Pubkey::create_program_address(
        &[wick_markets::SEED_MARKET, market.creator.as_ref(), &id, &[market.bump]],
        &wick_markets::ID,
    )
    .map_err(|_| SealedError::InvalidParams)?;
    require_keys_eq!(expected, *info.key, SealedError::InvalidParams);
    Ok(market)
}

fn pay_out<'info>(
    batch: &Account<'info, SealedBatch>,
    vault: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let seeds: &[&[u8]] = &[SEED_BATCH, batch.market.as_ref(), &[batch.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            token_program.key(),
            Transfer {
                from: vault.to_account_info(),
                to: to.to_account_info(),
                authority: batch.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )
}

// ---------------------------------------------------------------- state

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum BatchState {
    Initializing,
    Open,
    Revealing,
    Revealed,
    /// Too few orders to reveal without leaking them; every order is refunded in full.
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum OrderState {
    Pending,
    Placed,
    Settling,
    Settled,
    Paid,
}

/// `totals_ct` must stay first: circuits read it at offset 8, length 64.
#[account]
#[derive(InitSpace)]
pub struct SealedBatch {
    pub totals_ct: [[u8; 32]; 2],
    pub totals_nonce: u128,
    pub market: Pubkey,
    pub mint: Pubkey,
    pub close_ts: i64,
    pub state: BatchState,
    /// Non-zero while a place_order computation is in flight (serialises updates).
    pub busy_since: i64,
    /// The order whose computation holds the lock; only its callback may update totals.
    pub pending_order: Pubkey,
    pub order_count: u32,
    pub escrowed: u64,
    pub yes_total: u64,
    pub no_total: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

/// `order_ct` must stay first: circuits read it at offset 8, length 64.
#[account]
#[derive(InitSpace)]
pub struct SealedOrder {
    pub order_ct: [[u8; 32]; 2],
    pub order_nonce: u128,
    pub batch: Pubkey,
    pub owner: Pubkey,
    pub deposit: u64,
    pub payout: u64,
    pub state: OrderState,
    pub bump: u8,
}

// ---------------------------------------------------------------- non-MPC accounts

#[derive(Accounts)]
pub struct CancelStuckOrder<'info> {
    pub owner: Signer<'info>,
    #[account(mut)]
    pub batch: Account<'info, SealedBatch>,
    #[account(mut, has_one = batch, has_one = owner)]
    pub order: Account<'info, SealedOrder>,
    #[account(mut, seeds = [SEED_BATCH_VAULT, batch.key().as_ref()], bump = batch.vault_bump)]
    pub batch_vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = batch.mint, token::authority = owner)]
    pub owner_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawPayout<'info> {
    pub owner: Signer<'info>,
    pub batch: Account<'info, SealedBatch>,
    #[account(mut, has_one = batch, has_one = owner)]
    pub order: Account<'info, SealedOrder>,
    #[account(mut, seeds = [SEED_BATCH_VAULT, batch.key().as_ref()], bump = batch.vault_bump)]
    pub batch_vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = batch.mint, token::authority = owner)]
    pub owner_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

// ---------------------------------------------------------------- queue accounts

#[queue_computation_accounts("init_totals", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct CreateBatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Wick market; validated in `load_market`. May be delegated to the ER.
    pub market: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + SealedBatch::INIT_SPACE,
        seeds = [SEED_BATCH, market.key().as_ref()],
        bump,
    )]
    pub batch: Box<Account<'info, SealedBatch>>,
    #[account(
        init,
        payer = payer,
        seeds = [SEED_BATCH_VAULT, batch.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = batch,
    )]
    pub batch_vault: Box<Account<'info, TokenAccount>>,
    pub mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account))]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account))]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account))]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_INIT_TOTALS))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(mut, address = derive_cluster_pda!(mxe_account))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[queue_computation_accounts("place_order", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct PlaceOrder<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub batch: Box<Account<'info, SealedBatch>>,
    #[account(
        init,
        payer = payer,
        space = 8 + SealedOrder::INIT_SPACE,
        seeds = [SEED_ORDER, batch.key().as_ref(), payer.key().as_ref()],
        bump,
    )]
    pub order: Box<Account<'info, SealedOrder>>,
    #[account(mut, seeds = [SEED_BATCH_VAULT, batch.key().as_ref()], bump = batch.vault_bump)]
    pub batch_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = batch.mint, token::authority = payer)]
    pub owner_token: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account))]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account))]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account))]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_PLACE_ORDER))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(mut, address = derive_cluster_pda!(mxe_account))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[queue_computation_accounts("reveal_totals", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct RevealBatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub batch: Box<Account<'info, SealedBatch>>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account))]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account))]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account))]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_REVEAL_TOTALS))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(mut, address = derive_cluster_pda!(mxe_account))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[queue_computation_accounts("reveal_order", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct SettleOrder<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(has_one = market)]
    pub batch: Box<Account<'info, SealedBatch>>,
    #[account(mut, has_one = batch)]
    pub order: Box<Account<'info, SealedOrder>>,
    /// CHECK: Wick market; must be back on base (owned by wick_markets) and resolved.
    pub market: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account))]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account))]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account))]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_REVEAL_ORDER))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(mut, address = derive_cluster_pda!(mxe_account))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

// ---------------------------------------------------------------- callback accounts

#[callback_accounts("init_totals")]
#[derive(Accounts)]
pub struct InitTotalsCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_INIT_TOTALS))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: validated by the Arcium program; verify_output reads slot data from it.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::arcium_anchor::solana_instructions_sysvar::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: UncheckedAccount<'info>,
    #[account(mut)]
    pub batch: Account<'info, SealedBatch>,
}

#[callback_accounts("place_order")]
#[derive(Accounts)]
pub struct PlaceOrderCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_PLACE_ORDER))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: validated by the Arcium program; verify_output reads slot data from it.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::arcium_anchor::solana_instructions_sysvar::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: UncheckedAccount<'info>,
    #[account(mut)]
    pub batch: Account<'info, SealedBatch>,
    #[account(mut, has_one = batch)]
    pub order: Account<'info, SealedOrder>,
}

#[callback_accounts("reveal_totals")]
#[derive(Accounts)]
pub struct RevealTotalsCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_REVEAL_TOTALS))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: validated by the Arcium program; verify_output reads slot data from it.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::arcium_anchor::solana_instructions_sysvar::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: UncheckedAccount<'info>,
    #[account(mut)]
    pub batch: Account<'info, SealedBatch>,
}

#[callback_accounts("reveal_order")]
#[derive(Accounts)]
pub struct RevealOrderCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_REVEAL_ORDER))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: validated by the Arcium program; verify_output reads slot data from it.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::arcium_anchor::solana_instructions_sysvar::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: UncheckedAccount<'info>,
    #[account(mut)]
    pub order: Account<'info, SealedOrder>,
    pub batch: Account<'info, SealedBatch>,
    /// CHECK: Wick market; validated in `resolution`.
    pub market: UncheckedAccount<'info>,
}

// ---------------------------------------------------------------- comp def accounts

macro_rules! comp_def_accounts {
    ($name:ident, $ix:literal) => {
        #[init_computation_definition_accounts($ix, payer)]
        #[derive(Accounts)]
        pub struct $name<'info> {
            #[account(mut)]
            pub payer: Signer<'info>,
            #[account(mut, address = derive_mxe_pda!())]
            pub mxe_account: Box<Account<'info, MXEAccount>>,
            #[account(mut)]
            /// CHECK: comp_def_account, checked by arcium program.
            pub comp_def_account: UncheckedAccount<'info>,
            #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
            /// CHECK: address_lookup_table, checked by arcium program.
            pub address_lookup_table: UncheckedAccount<'info>,
            #[account(address = LUT_PROGRAM_ID)]
            /// CHECK: lut_program is the Address Lookup Table program.
            pub lut_program: UncheckedAccount<'info>,
            pub arcium_program: Program<'info, Arcium>,
            pub system_program: Program<'info, System>,
        }
    };
}

comp_def_accounts!(InitInitTotalsCompDef, "init_totals");
comp_def_accounts!(InitPlaceOrderCompDef, "place_order");
comp_def_accounts!(InitRevealTotalsCompDef, "reveal_totals");
comp_def_accounts!(InitRevealOrderCompDef, "reveal_order");

// ---------------------------------------------------------------- events / errors

#[event]
pub struct SealedOrderPlaced {
    pub batch: Pubkey,
    pub order: Pubkey,
    pub deposit: u64,
}

#[event]
pub struct BatchRevealed {
    pub batch: Pubkey,
    pub yes_total: u64,
    pub no_total: u64,
}

#[error_code]
pub enum SealedError {
    #[msg("The computation was aborted")]
    AbortedComputation,
    #[msg("Invalid parameters")]
    InvalidParams,
    #[msg("Batch is closed")]
    BatchClosed,
    #[msg("Batch is still open")]
    BatchOpen,
    #[msg("Another order is being processed; retry shortly")]
    BatchBusy,
    #[msg("Order is not in the required state")]
    OrderState,
    #[msg("Market is not resolved")]
    MarketNotResolved,
    #[msg("Only the market creator can open its sealed batch")]
    Unauthorized,
}
