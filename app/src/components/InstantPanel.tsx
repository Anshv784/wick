"use client";

import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useMemo, useState } from "react";
import { claimPosition, fundPosition, trade } from "@/lib/actions";
import { fmtNum, fmtPct } from "@/lib/format";
import { usePosition, useUsdc } from "@/lib/hooks";
import { fpmmBuy, fpmmSell, yesBps } from "@/lib/pricing";
import type { Located, MarketAccount } from "@/lib/wick";
import { marketStatus } from "./StatusPill";
import { useToast } from "./Toast";
import { AmountInput, Button, Row, Segmented } from "./ui";

const SLIPPAGE = 0.02;

export function InstantPanel({ k, m, refresh }: { k: PublicKey; m: Located<MarketAccount>; refresh: () => void }) {
  const wallet = useAnchorWallet();
  const { push } = useToast();
  const pos = usePosition(k);
  const usdc = useUsdc();
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [amt, setAmt] = useState("");
  const [fund, setFund] = useState("");
  const [busy, setBusy] = useState<string>();

  const md = m.data;
  const fee = md.feeBps / 10_000;
  const yesRes = md.yesReserve.toNumber();
  const noRes = md.noReserve.toNumber();
  const status = marketStatus(md);
  const tradable = status === "open" && md.expiry.toNumber() > Date.now() / 1000;
  const p = pos.data?.data;
  const balance = p ? p.balance.toNumber() / 1e6 : 0;
  const held = p ? (side === "yes" ? p.yes : p.no).toNumber() / 1e6 : 0;

  const preview = useMemo(() => {
    const v = Number(amt);
    if (!v || v <= 0) return null;
    const units = Math.round(v * 1e6);
    const [sr, or] = side === "yes" ? [yesRes, noRes] : [noRes, yesRes];
    if (mode === "buy") {
      const net = Math.floor(units * (1 - fee));
      const r = fpmmBuy(sr, or, net);
      const [ny, nn] = side === "yes" ? [r.newSide, r.newOther] : [r.newOther, r.newSide];
      return { out: r.out, avg: units / r.out, newYes: yesBps(ny, nn), payout: r.out / 1e6 };
    }
    const r = fpmmSell(sr, or, units);
    const out = Math.floor(r.out * (1 - fee));
    const [ny, nn] = side === "yes" ? [r.newSide, r.newOther] : [r.newOther, r.newSide];
    return { out, avg: out / units, newYes: yesBps(ny, nn), payout: out / 1e6 };
  }, [amt, side, mode, yesRes, noRes, fee]);

  async function run(label: string, fn: () => Promise<string | null>, er = false) {
    if (!wallet) return;
    setBusy(label);
    try {
      const sig = await fn();
      push({ kind: "ok", title: label, sig: sig ?? undefined, er });
      pos.refresh();
      usdc.refresh();
      refresh();
    } catch (e) {
      push({ kind: "err", title: `${label} failed`, body: (e as Error).message.slice(0, 180) });
    } finally {
      setBusy(undefined);
    }
  }

  const yes = yesBps(yesRes, noRes);
  const needsFunding = !p || (balance < 0.01 && p.yes.isZero() && p.no.isZero());
  const posOnWrongLayer = p && pos.data!.onEr !== m.onEr;

  if (status !== "open") {
    const claimed = p?.claimed;
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-muted">
          {status === "frozen"
            ? "Oracles disagreed at expiry, so the market froze. It can be voided (0.5 per share) after 24h."
            : status === "voided"
              ? "Market voided. Every share redeems at 0.50 USDC."
              : "Market settled. Winning shares redeem at 1.00 USDC."}
        </p>
        {p && !claimed && status !== "frozen" && (
          <Button tone="flame" busy={busy === "Claim"} onClick={() => run("Claim", () => claimPosition(wallet!, k, "claim"))}>
            Claim position
          </Button>
        )}
        {claimed && <p className="text-[12px] text-yes">Claimed ✓</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(["yes", "no"] as const).map((s) => {
          const pct = s === "yes" ? yes : 10_000 - yes;
          const active = side === s;
          return (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={`rounded-xl border p-3 text-left transition ${active ? (s === "yes" ? "border-yes/70 bg-yes/10" : "border-no/70 bg-no/10") : "hairline hover:border-line-2"}`}
            >
              <div className={`text-[11px] font-semibold tracking-wider uppercase ${s === "yes" ? "text-yes" : "text-no"}`}>{s}</div>
              <div className="num mt-1 text-[22px]">{(pct / 100).toFixed(1)}¢</div>
            </button>
          );
        })}
      </div>

      <Segmented
        layoutId="instant-mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: "buy", label: "Buy" },
          { value: "sell", label: "Sell" },
        ]}
      />

      {!wallet ? (
        <p className="py-6 text-center text-[13px] text-muted">Connect a wallet to trade.</p>
      ) : needsFunding || posOnWrongLayer ? (
        <div className="space-y-3 rounded-xl border border-dashed border-line-2 p-4">
          <div className="text-[13px] font-semibold">Fund your trading account</div>
          <p className="text-[12px] leading-relaxed text-muted">
            USDC moves into the market vault once; after that every trade runs on the MagicBlock rollup instantly, with no gas.
          </p>
          <AmountInput label="Deposit" value={fund} onChange={setFund} max={usdc.data} />
          <Button
            busy={busy === "Deposit"}
            disabled={!Number(fund)}
            onClick={() => run("Deposit", () => fundPosition(wallet, k, Number(fund), m.onEr))}
          >
            Deposit & go instant
          </Button>
        </div>
      ) : (
        <>
          <AmountInput
            label={mode === "buy" ? "Spend" : "Sell shares"}
            suffix={mode === "buy" ? "USDC" : side.toUpperCase()}
            value={amt}
            onChange={setAmt}
            max={mode === "buy" ? balance : held}
          />
          <div className="rounded-xl bg-ink px-3.5 py-2.5">
            <Row k={mode === "buy" ? "Shares out" : "USDC out"} v={preview ? fmtNum(preview.out / 1e6) : "—"} />
            <Row k="Avg price" v={preview ? `${(preview.avg * 100).toFixed(1)}¢` : "—"} />
            <Row k="YES after" v={preview ? fmtPct(preview.newYes) : fmtPct(yes)} />
            {mode === "buy" && (
              <Row k="Pays if right" v={preview ? `$${fmtNum(preview.payout)}` : "—"} cls="text-yes" />
            )}
          </div>
          <Button
            tone={side === "yes" ? "yes" : "no"}
            busy={busy === "Trade"}
            disabled={!preview || !tradable}
            onClick={() =>
              run(
                "Trade",
                () =>
                  trade(wallet, k, m.onEr, mode, side, Math.round(Number(amt) * 1e6), Math.floor(preview!.out * (1 - SLIPPAGE))),
                m.onEr,
              )
            }
          >
            {mode === "buy" ? "Buy" : "Sell"} {side.toUpperCase()}
          </Button>
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span className="num">
              credit ${fmtNum(balance)} · {fmtNum(p!.yes.toNumber() / 1e6)} YES · {fmtNum(p!.no.toNumber() / 1e6)} NO
            </span>
            <button className="hover:text-paper" onClick={() => run("Top up", () => fundPosition(wallet, k, 25, m.onEr))}>
              + $25
            </button>
          </div>
        </>
      )}
      {m.onEr && (
        <p className="flex items-center gap-2 text-[11px] text-muted">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-yes" /> Executing on MagicBlock ephemeral rollup
        </p>
      )}
    </div>
  );
}
