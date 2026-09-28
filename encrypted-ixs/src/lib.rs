use arcis::*;

/// Sealed batch for a Wick market.
///
/// Orders are encrypted (side + size). The cluster keeps running YES/NO totals under MXE
/// encryption, reveals only the two totals when the batch closes, and every order fills
/// at the single clearing price `yes_total / (yes_total + no_total)`. Individual sides
/// and sizes stay hidden while the market trades; each order is opened only after the
/// market resolves, to pay it out.
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

    /// Opens one order once its market has resolved, so the program can pay it out. The
    /// payout itself (and the refund of unused deposit) would reveal the same numbers, so
    /// this leaks nothing beyond what settlement already makes public.
    #[instruction]
    pub fn reveal_order(order_ctxt: Enc<Mxe, OrderIn>) -> (bool, u64) {
        let order = order_ctxt.to_arcis();
        (order.yes.reveal(), order.amount.reveal())
    }

    #[derive(Copy, Clone)]
    pub struct StopIn {
        price: u64,
    }

    /// Hidden stop-loss: compares the oracle mark against the trader's encrypted stop price and
    /// reveals only whether it was crossed. The stop level itself never leaves MPC.
    #[instruction]
    pub fn check_stop(stop_ctxt: Enc<Shared, StopIn>, is_long: bool, mark: u64) -> bool {
        let stop = stop_ctxt.to_arcis();
        let hit = if is_long { mark <= stop.price } else { mark >= stop.price };
        hit.reveal()
    }
}
