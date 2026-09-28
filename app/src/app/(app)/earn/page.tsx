"use client";

import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { BN } from "@anchor-lang/core";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/Toast";
import { AmountInput, Button, Row } from "@/components/ui";
import { fmtNum } from "@/lib/format";
import { usePoll } from "@/lib/hooks";
import { fetchPerps, lpDeposit, lpWithdraw, PERP_SYMBOLS } from "@/lib/perps";

export default function PoolPage() {
  const wallet = useAnchorWallet();
  const { push } = useToast();
  const perps = usePoll(() => fetchPerps(wallet?.publicKey), 3000, [wallet?.publicKey.toBase58()]);
  const [amt, setAmt] = useState("100");
  const [busy, setBusy] = useState<string>();
  const pool = perps.data?.pool?.data;
  const acc = perps.data?.account?.data;

  const liquidity = pool ? pool.liquidity.toNumber() / 1e6 : 0;
  const shares = pool ? pool.shares.toNumber() : 0;
  const sharePrice = shares ? (liquidity * 1e6) / shares : 1;
  const reserved = pool ? pool.reserved.toNumber() / 1e6 : 0;
  const myShares = acc ? acc.lpShares.toNumber() : 0;
  const myValue = (myShares * sharePrice) / 1e6;
  const credit = acc ? acc.credit.toNumber() / 1e6 : 0;
  const oi = PERP_SYMBOLS.reduce((t, s) => {
    const m = perps.data?.markets[s]?.data;
    return t + (m ? (m.longOi.toNumber() + m.shortOi.toNumber()) / 1e6 : 0);
  }, 0);

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label);
    try {
      const sig = await fn();
      push({ kind: "ok", title: label, sig, er: true });
      perps.refresh();
    } catch (e) {
      push({ kind: "err", title: `${label} failed`, body: (e as Error).message.slice(0, 160) });
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="pt-10">
      <p className="num text-[11px] tracking-wide text-flame-2 uppercase">Earn · perp LP pool</p>
      <h1 className="font-display mt-1 text-[52px] leading-none tracking-tight">Be the house</h1>
      <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted">
        The LP pool is the counterparty to every perp trade. It earns open, close and borrow fees plus trader losses, and pays
        trader profits. Profits are capped and reserved up front, so the pool can never promise more than it holds.
      </p>

      <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border hairline bg-line sm:grid-cols-4">
        {[
          ["Pool liquidity", `$${fmtNum(liquidity, 0)}`],
          ["Share price", `$${sharePrice.toFixed(4)}`],
          ["Reserved for open trades", `$${fmtNum(reserved, 0)}`],
          ["Open interest", `$${fmtNum(oi, 0)}`],
        ].map(([k, v]) => (
          <div key={k} className="bg-ink p-6">
            <div className="text-[11px] tracking-wide text-muted uppercase">{k}</div>
            <div className="num mt-2 text-[26px]">{v}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="panel p-6">
          <h3 className="font-display text-[26px] tracking-tight">How LPs earn</h3>
          <ul className="mt-4 space-y-3 text-[14px] leading-relaxed text-muted">
            <li>
              <span className="text-paper">Fees:</span> 0.06% to open and close, plus 0.01% per hour borrow on every position.
            </li>
            <li>
              <span className="text-paper">Trader PnL:</span> losses flow to the pool; profits are paid from it, capped at 10× the
              trade&apos;s collateral and reserved at open.
            </li>
            <li>
              <span className="text-paper">Wick-proof liquidations:</span> positions are only liquidated when Pyth and Switchboard
              agree, so a single bad print can&apos;t wipe out a trader (or hand the pool an unfair win).
            </li>
            <li>
              <span className="text-paper">Withdrawals:</span> any liquidity not reserved for open trades can leave instantly.
            </li>
          </ul>
        </div>
        <div className="panel space-y-4 p-5">
          {!wallet ? (
            <p className="py-6 text-center text-[13px] text-muted">Connect a wallet to provide liquidity.</p>
          ) : !acc ? (
            <p className="py-4 text-[13px] leading-relaxed text-muted">
              Deposit USDC into your trading account on the{" "}
              <Link href="/trade" className="text-flame-2 hover:underline">
                perps page
              </Link>{" "}
              first. LP deposits come from that balance.
            </p>
          ) : (
            <>
              <div className="rounded-xl bg-ink px-3.5 py-2.5">
                <Row k="Your LP value" v={`$${fmtNum(myValue)}`} cls="text-flame" />
                <Row k="Your share" v={shares ? `${((myShares / shares) * 100).toFixed(2)}%` : "—"} />
                <Row k="Free credit" v={`$${fmtNum(credit)}`} />
              </div>
              <AmountInput label="Amount" value={amt} onChange={setAmt} max={credit} />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  tone="flame"
                  busy={busy === "Add liquidity"}
                  disabled={!Number(amt) || Number(amt) > credit}
                  onClick={() => run("Add liquidity", () => lpDeposit(wallet, Number(amt)))}
                >
                  Add
                </Button>
                <button
                  disabled={!!busy || !Number(amt) || Number(amt) > myValue}
                  onClick={() =>
                    run("Remove liquidity", () =>
                      lpWithdraw(wallet, new BN(Math.min(myShares, Math.floor((Number(amt) * 1e6) / sharePrice)))),
                    )
                  }
                  className="h-12 rounded-xl border hairline text-[14px] font-semibold hover:border-line-2 disabled:opacity-40"
                >
                  {busy === "Remove liquidity" ? "…" : "Remove"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
