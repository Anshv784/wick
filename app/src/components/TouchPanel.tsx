"use client";

import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { buyTicket } from "@/lib/actions";
import type { AssetSymbol } from "@/lib/assets";
import { fmtNum, fmtUsd } from "@/lib/format";
import { useBook, useUsdc } from "@/lib/hooks";
import { TouchKind, touchFairBps, touchQuoteBps } from "@/lib/pricing";
import { useLivePrice } from "@/lib/prices";
import { ORACLES } from "@/lib/wick";
import type { ChartLine } from "./PriceChart";
import { useToast } from "./Toast";
import { AmountInput, Button, Row, Segmented } from "./ui";

export function TouchPanel({
  k,
  symbol,
  expiry,
  onLines,
  onBought,
}: {
  k: PublicKey;
  symbol: AssetSymbol;
  expiry: number;
  onLines: (l: ChartLine[]) => void;
  onBought: () => void;
}) {
  const wallet = useAnchorWallet();
  const { push } = useToast();
  const book = useBook(k);
  const usdc = useUsdc();
  const spot = useLivePrice(symbol);
  const [kind, setKind] = useState<TouchKind>("up");
  const [upPct, setUpPct] = useState(2);
  const [downPct, setDownPct] = useState(2);
  const [stake, setStake] = useState("10");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);

  const b = book.data;
  const s = spot?.price ?? 0;
  const upper = s * (1 + upPct / 100);
  const lower = s * (1 - downPct / 100);
  const barrier = kind === "down" ? lower : upper;
  const barrier2 = kind === "upBeforeDown" ? lower : 0;
  const tLeft = expiry - now;

  const quote = useMemo(() => {
    if (!b || !s || tLeft <= 60) return null;
    const fair = touchFairBps(kind, s, barrier, barrier2, b.volBps, tLeft);
    if (fair == null) return null;
    const price = touchQuoteBps(fair, b.marginBps);
    const st = Number(stake) || 0;
    const payout = (st * 10_000) / price;
    const capacity = b.free.toNumber() / 1e6;
    const maxPayout = b.maxPayout.toNumber() / 1e6;
    return { fair, price, payout, mult: 10_000 / price, ok: payout - st <= capacity && payout <= maxPayout, capacity, maxPayout };
  }, [b, s, kind, barrier, barrier2, tLeft, stake]);

  useEffect(() => {
    if (!s) return;
    const lines: ChartLine[] = [];
    if (kind !== "down") lines.push({ price: upper, color: "#ff7a1a", title: "touch ↑" });
    if (kind !== "up") lines.push({ price: lower, color: kind === "upBeforeDown" ? "#ff6b81" : "#ff7a1a", title: kind === "upBeforeDown" ? "knock-out" : "touch ↓" });
    onLines(lines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, Math.round(upper * 100), Math.round(lower * 100)]);

  const pythAccount = ORACLES?.[symbol]?.pythAccount;

  async function buy() {
    if (!wallet || !quote || !pythAccount) return;
    setBusy(true);
    try {
      const sig = await buyTicket(wallet, k, new PublicKey(pythAccount), {
        kind,
        barrier,
        barrier2,
        stake: Number(stake),
        // Allow a little drift between the UI quote and the on-chain spot.
        maxPriceBps: Math.min(9_500, Math.ceil(quote.price * 1.05)),
      });
      push({ kind: "ok", title: `Touch ticket live · pays $${fmtNum(quote.payout)}`, sig });
      onBought();
      usdc.refresh();
      book.refresh();
    } catch (e) {
      push({ kind: "err", title: "Ticket failed", body: (e as Error).message.slice(0, 180) });
    } finally {
      setBusy(false);
    }
  }

  if (book.loading && !b) return <div className="h-72 animate-pulse rounded-xl bg-ink" />;
  if (!b) return <p className="text-[13px] text-muted">The house hasn&apos;t opened a touch book for this market.</p>;

  return (
    <div className="space-y-4">
      <Segmented
        layoutId="touch-kind"
        value={kind}
        onChange={setKind}
        options={[
          { value: "up", label: "Touch ↑" },
          { value: "down", label: "Touch ↓" },
          { value: "upBeforeDown", label: "↑ before ↓" },
        ]}
      />

      <p className="min-h-[36px] text-[12px] leading-relaxed text-muted">
        {kind === "up" && <>Pays if {symbol} trades at or above the level at any moment before expiry.</>}
        {kind === "down" && <>Pays if {symbol} trades at or below the level at any moment before expiry.</>}
        {kind === "upBeforeDown" && <>Pays if {symbol} hits the upper level before it hits the knock-out below.</>}
      </p>

      {kind !== "down" && (
        <Level label="Upper level" pct={upPct} setPct={setUpPct} price={upper} sign="+" />
      )}
      {kind !== "up" && (
        <Level
          label={kind === "upBeforeDown" ? "Knock-out" : "Lower level"}
          pct={downPct}
          setPct={setDownPct}
          price={lower}
          sign="−"
          danger={kind === "upBeforeDown"}
        />
      )}

      <AmountInput label="Stake" value={stake} onChange={setStake} max={usdc.data} />

      <div className="relative overflow-hidden rounded-xl border hairline bg-ink p-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[11px] tracking-wide text-muted uppercase">Payout</div>
            <AnimatePresence mode="popLayout">
              <motion.div
                key={quote ? quote.payout.toFixed(2) : "x"}
                initial={{ opacity: 0.4, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="num text-[30px] leading-tight text-flame"
              >
                {quote ? `$${fmtNum(quote.payout)}` : "—"}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="num rounded-lg bg-flame/10 px-2.5 py-1 text-[15px] text-flame-2">
            {quote ? `${quote.mult.toFixed(2)}×` : "—"}
          </div>
        </div>
        <div className="mt-3 border-t hairline pt-2">
          <Row k="Model probability" v={quote ? `${(quote.fair / 100).toFixed(1)}%` : "—"} />
          <Row k="Ticket price (incl. edge)" v={quote ? `${(quote.price / 100).toFixed(1)}%` : "—"} />
          <Row k="House capacity" v={quote ? `$${fmtNum(quote.capacity)}` : "—"} />
        </div>
      </div>

      <Button tone="flame" busy={busy} disabled={!wallet || !quote || !quote.ok || !Number(stake) || !pythAccount} onClick={buy}>
        {!wallet ? "Connect wallet" : quote && !quote.ok ? "Exceeds house capacity" : "Buy touch ticket"}
      </Button>
      <p className="text-[11px] leading-relaxed text-faint">
        Settled only when Pyth and Switchboard both print through your level within {30}s of each other. The full payout is reserved in the house vault the moment you buy.
      </p>
    </div>
  );
}

function Level({
  label,
  pct,
  setPct,
  price,
  sign,
  danger,
}: {
  label: string;
  pct: number;
  setPct: (n: number) => void;
  price: number;
  sign: string;
  danger?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[11px] text-muted">{label}</span>
        <span className="num text-[14px]">
          <span className={danger ? "text-no" : "text-flame-2"}>
            {sign}
            {pct.toFixed(1)}%
          </span>{" "}
          <span className="text-muted">·</span> {fmtUsd(price)}
        </span>
      </div>
      <input
        type="range"
        className="wick-range w-full"
        min={0.2}
        max={15}
        step={0.1}
        value={pct}
        onChange={(e) => setPct(Number(e.target.value))}
      />
    </div>
  );
}
