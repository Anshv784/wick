use arcis::*;

/// Sealed batch for a Wick market.
///
/// Orders are encrypted (side + size). The cluster keeps running YES/NO totals under MXE
/// encryption, reveals only the two totals when the batch closes, and every order fills
/// at the single clearing price `yes_total / (yes_total + no_total)`. Individual sides
/// and sizes are never revealed; only each order's final payout is, after the market
/// has settled.
#[encrypted]
mod circuits {
    use arcis::*;

    #[derive(Copy, Clone)]
    pub struct OrderIn {
        yes: bool,
        amount: u64,
    }

    #[derive(Copy, Clone)]
    pub struct Totals {
        yes: u64,
        no: u64,
    }

    #[instruction]
    pub fn init_totals() -> Enc<Mxe, Totals> {
        Mxe::get().from_arcis(Totals { yes: 0, no: 0 })
    }

    /// Adds one order to the running totals. The size is clamped to the public deposit so a
    /// trader can never commit more than they escrowed. Returns the new totals and an
    /// MXE-encrypted copy of the (clamped) order for settlement.
    #[instruction]
    pub fn place_order(
        order_ctxt: Enc<Shared, OrderIn>,
        deposit: u64,
        totals_ctxt: Enc<Mxe, Totals>,
    ) -> (Enc<Mxe, Totals>, Enc<Mxe, OrderIn>) {
        let order = order_ctxt.to_arcis();
        let mut totals = totals_ctxt.to_arcis();
        let amount = if order.amount > deposit { deposit } else { order.amount };
        if order.yes {
            totals.yes += amount;
        } else {
            totals.no += amount;
        }
        let stored = OrderIn { yes: order.yes, amount };
        (
            totals_ctxt.owner.from_arcis(totals),
            Mxe::get().from_arcis(stored),
        )
    }

    #[instruction]
    pub fn reveal_totals(totals_ctxt: Enc<Mxe, Totals>) -> (u64, u64) {
        let totals = totals_ctxt.to_arcis();
        (totals.yes.reveal(), totals.no.reveal())
    }

    /// Payout for one order once the market is resolved. Winners split the whole batch
    /// pro rata (equivalent to buying shares at the clearing price); unused deposit is
    /// returned. A void market or a one-sided batch refunds the full deposit.
    #[instruction]
    pub fn settle_order(
        order_ctxt: Enc<Mxe, OrderIn>,
        deposit: u64,
        yes_won: bool,
        voided: bool,
        yes_total: u64,
        no_total: u64,
    ) -> u64 {
        let order = order_ctxt.to_arcis();
        let pool = yes_total as u128 + no_total as u128;
        let side_total = if order.yes { yes_total } else { no_total } as u128;
        let safe_div = if side_total == 0 { 1u128 } else { side_total };
        let won = order.yes == yes_won;
        let winnings = if won {
            order.amount as u128 * pool / safe_div
        } else {
            0u128
        };
        let one_sided = yes_total == 0 || no_total == 0;
        let payout = if voided || one_sided {
            deposit as u128
        } else {
            winnings + (deposit - order.amount) as u128
        };
        (payout as u64).reveal()
    }
}
