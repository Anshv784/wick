"use client";

import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChartLine, PriceChart } from "@/components/PriceChart";
import { PerpDepth } from "@/components/Depth";
import { useToast } from "@/components/Toast";
import { AmountInput, Button, Row, Segmented } from "@/components/ui";
import { buyTicket } from "@/lib/actions";
import { ASSETS, AssetSymbol, assetFromBytes } from "@/lib/assets";
import { countdown, fmtNum, fmtUsd } from "@/lib/format";
import { useBook, useMarkets, useNow, usePoll, useUsdc } from "@/lib/hooks";
import {
  adjustMargin,
  borrowOwed,
  cancelPerpOrder,
  closePerp,
  placePerpOrder,
  depositPerp,
  fetchPerps,
  liqPrice,
  openPerp,
  PERP_SYMBOLS,
  PERPS_LIVE,
  pnl,
  Side,
  slotIndex,
  withdrawPerp,
} from "@/lib/perps";
import { touchFairBps, touchQuoteBps } from "@/lib/pricing";
import { useLivePrice } from "@/lib/prices";
import { ORACLES } from "@/lib/wick";
import { cancelHiddenStop, fetchHiddenStop, setHiddenStop } from "@/lib/sealed";

const LEV_MARKS = [2, 5, 10, 20, 35, 50];
const SLIPPAGE = 0.005;

export default function PerpsPage() {
  const wallet = useAnchorWallet();
  const [symbol, setSymbol] = useState<AssetSymbol>("SOL");
  const perps = usePoll(() => fetchPerps(wallet?.publicKey), 2500, [wallet?.publicKey.toBase58()]);
  const tick = useLivePrice(symbol);
  const m = perps.data?.markets[symbol]?.data;
  const acc = perps.data?.account?.data;

  const lines: ChartLine[] = useMemo(() => {
    if (!acc || !m) return [];
    const out: ChartLine[] = [];
    (["long", "short"] as Side[]).forEach((side) => {
      const s = acc.slots[slotIndex(symbol, side)];
      if (s.size.isZero()) return;
      const size = s.size.toNumber() / 1e6;
      const entry = s.entryPrice.toNumber() / 1e8;
      out.push({ price: entry, color: side === "long" ? "#5ee0a1" : "#ff6b81", title: `${side} entry`, dashed: true });
      out.push({
        price: liqPrice(side, size, s.collateral.toNumber() / 1e6, entry, m, borrowOwed(size, s.borrowIdx, m.borrowIdx)),
        color: "#ff7a1a",
        title: "liq (both oracles)",
      });
    });
    return out;
  }, [acc, m, symbol]);

  if (!PERPS_LIVE) return <p className="pt-24 text-center text-muted">Perps aren&apos;t deployed on this network yet.</p>;

  return (
    <div className="pt-8">
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <p className="num text-[11px] tracking-wide text-flame-2 uppercase">Wick-proof perps</p>
          <h1 className="font-display mt-1 text-[48px] leading-none tracking-tight">Perpetuals</h1>
        </div>
        <div className="ml-auto flex gap-1 rounded-xl border hairline bg-ink p-1">
          {PERP_SYMBOLS.map((s) => (
            <AssetTab key={s} s={s} active={s === symbol} onClick={() => setSymbol(s)} />
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-5">
          <div className="panel overflow-hidden">
            <PriceChart
              symbol={symbol}
              lines={lines}
              height={420}
              label={`${symbol}-PERP`}
              depth={<PerpDepth symbol={symbol} mark={tick?.price} />}
            />
          </div>
          <Positions perps={perps.data} refresh={perps.refresh} />
          <OpenOrders perps={perps.data} refresh={perps.refresh} />
          <MarketStats m={m} pool={perps.data?.pool?.data} price={tick?.price} />
        </div>
        <aside className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
          <OrderPanel symbol={symbol} perps={perps.data} refresh={perps.refresh} />
          <AccountPanel perps={perps.data} refresh={perps.refresh} />
        </aside>
      </div>
    </div>
  );
}

function AssetTab({ s, active, onClick }: { s: AssetSymbol; active: boolean; onClick: () => void }) {
  const t = useLivePrice(s);
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-left transition ${active ? "bg-ink-3" : "hover:bg-white/[0.03]"}`}
    >
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        <span className="h-2 w-2 rounded-full" style={{ background: ASSETS[s].color }} />
        {s}-PERP
      </div>
      <div className="num text-[12px] text-muted">{t ? fmtUsd(t.price) : "—"}</div>
    </button>
  );
}

type Perps = Awaited<ReturnType<typeof fetchPerps>> | undefined;

function OrderPanel({ symbol, perps, refresh }: { symbol: AssetSymbol; perps: Perps; refresh: () => void }) {
  const wallet = useAnchorWallet();
  const { push } = useToast();
  const tick = useLivePrice(symbol);
  const [side, setSide] = useState<Side>("long");
  const [type, setType] = useState<"market" | "limit">("market");
  const [limitPx, setLimitPx] = useState("");
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [showTpsl, setShowTpsl] = useState(false);
  const [collateral, setCollateral] = useState("50");
  const [lev, setLev] = useState(20);
  const [insure, setInsure] = useState(true);
  const [busy, setBusy] = useState(false);
  const m = perps?.markets[symbol]?.data;
  const acc = perps?.account?.data;
  const pool = perps?.pool?.data;
  const credit = acc ? acc.credit.toNumber() / 1e6 : 0;
  const live = tick?.price ?? 0;
  const limitValue = Number(limitPx);
  const price = type === "limit" && limitValue > 0 ? limitValue : live;
  const col = Number(collateral) || 0;
  const size = col * lev;
  const openFee = m ? (size * m.openFeeBps) / 10_000 : 0;
  const liq = m && price ? liqPrice(side, size, col - openFee, price, m) : 0;
  const reserve = Math.min(size, col * 10);
  const capacity = pool ? (pool.liquidity.toNumber() - pool.reserved.toNumber()) / 1e6 : 0;
  const insurance = useInsurance(symbol, side, liq, col - openFee);

  async function submit() {
    if (!wallet || !m) return;
    setBusy(true);
    try {
      if (type === "limit") {
        const sig = await placePerpOrder(wallet, symbol, side, "limitOpen", limitValue, col, lev);
        push({ kind: "ok", title: `Limit ${side} ${symbol} placed at ${fmtUsd(limitValue)}`, body: "Collateral is escrowed; the keeper fills it when the oracle price gets there.", sig, er: true });
        refresh();
        return;
      }
      const limit = side === "long" ? price * (1 + SLIPPAGE) : price * (1 - SLIPPAGE);
      const sig = await openPerp(wallet, symbol, side, col, lev, limit);
      push({ kind: "ok", title: `${lev}x ${side} ${symbol} opened`, body: `Liquidation ≈ ${fmtUsd(liq)} and only if both oracles agree.`, sig, er: true });
      for (const [kind, v] of [["takeProfit", Number(tp)], ["stopLoss", Number(sl)]] as const) {
        if (v > 0) {
          await placePerpOrder(wallet, symbol, side, kind, v)
            .then(() => push({ kind: "ok", title: `${kind === "takeProfit" ? "Take-profit" : "Stop-loss"} set at ${fmtUsd(v)}` }))
            .catch((e) => push({ kind: "err", title: "TP/SL failed", body: (e as Error).message.slice(0, 120) }));
        }
      }
      if (insure && insurance.quote && type === "market") {
        try {
          const s2 = await buyTicket(wallet, insurance.market!, new PublicKey(ORACLES![symbol].pythAccount), new PublicKey(ORACLES![symbol].sbQuote), {
            kind: side === "long" ? "down" : "up",
            barrier: liq,
            barrier2: 0,
            stake: insurance.quote.stake,
            maxPriceBps: Math.min(9_500, Math.ceil(insurance.quote.priceBps * 1.08)),
          });
          push({ kind: "ok", title: `Insured: pays $${fmtNum(insurance.quote.payout)} if liquidated`, sig: s2 });
        } catch (e) {
          push({ kind: "err", title: "Position opened, insurance failed", body: (e as Error).message.slice(0, 160) });
        }
      }
      refresh();
    } catch (e) {
      push({ kind: "err", title: "Order failed", body: (e as Error).message.slice(0, 180) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel space-y-4 p-4">
      <div className="flex gap-4 border-b hairline pb-2 text-[13px]">
        {(["market", "limit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setType(t);
              if (t === "limit" && !limitPx && live) setLimitPx((side === "long" ? live * 0.99 : live * 1.01).toFixed(2));
            }}
            className={`pb-1 capitalize transition ${type === t ? "border-b-2 border-flame text-paper" : "text-muted hover:text-paper"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <Segmented
        layoutId="perp-side"
        value={side}
        onChange={setSide}
        options={[
          { value: "long", label: "Long", activeClass: "text-yes" },
          { value: "short", label: "Short", activeClass: "text-no" },
        ]}
      />
      {type === "limit" && <AmountInput label={`Limit price (${side === "long" ? "fills at or below" : "fills at or above"})`} suffix="USD" value={limitPx} onChange={setLimitPx} />}
      <AmountInput label="Collateral" value={collateral} onChange={setCollateral} max={credit} />
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[11px] text-muted">Leverage</span>
          <span className="num text-[18px] text-flame">{lev.toFixed(1)}×</span>
        </div>
        <input
          type="range"
          className="wick-range w-full"
          min={1.1}
          max={m?.maxLeverage ?? 50}
          step={0.1}
          value={lev}
          onChange={(e) => setLev(Number(e.target.value))}
        />
        <div className="mt-2 flex justify-between">
          {LEV_MARKS.map((x) => (
            <button key={x} onClick={() => setLev(x)} className="num text-[11px] text-muted hover:text-paper">
              {x}×
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-xl bg-ink px-3.5 py-2.5">
        <Row k="Position size" v={size ? `$${fmtNum(size)}` : "—"} />
        <Row k={type === "limit" ? "Entry (limit)" : "Entry (oracle)"} v={price ? fmtUsd(price) : "—"} />
        <Row k="Liquidation price" v={liq ? fmtUsd(liq) : "—"} cls="text-flame-2" />
        <Row k="Open fee" v={`$${fmtNum(openFee, 3)}`} />
        <Row k="Borrow" v={m ? `${(m.borrowPpmPerHour / 10_000).toFixed(3)}% / h` : "—"} />
      </div>

      {type === "market" && (
        <div>
          <button onClick={() => setShowTpsl(!showTpsl)} className="text-[12px] text-muted hover:text-paper">
            {showTpsl ? "−" : "+"} Take-profit / stop-loss
          </button>
          {showTpsl && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <AmountInput label="Take-profit" suffix="USD" value={tp} onChange={setTp} />
              <AmountInput label="Stop-loss" suffix="USD" value={sl} onChange={setSl} />
            </div>
          )}
        </div>
      )}

      {type === "market" && <button
        onClick={() => setInsure(!insure)}
        className={`w-full rounded-xl border p-3.5 text-left transition ${insure ? "border-flame/50 bg-flame/5" : "hairline"}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold">Liquidation insurance</span>
          <span className={`h-4 w-7 rounded-full p-0.5 transition ${insure ? "bg-flame" : "bg-line-2"}`}>
            <span className={`block h-3 w-3 rounded-full bg-ink transition ${insure ? "translate-x-3" : ""}`} />
          </span>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
          {insurance.quote
            ? `A touch ticket at your liquidation price: pay $${fmtNum(insurance.quote.stake)}, get $${fmtNum(insurance.quote.payout)} back if it's hit (covers ${countdown(insurance.left)}).`
            : insurance.reason}
        </p>
      </button>}

      <Button
        tone={side === "long" ? "yes" : "no"}
        busy={busy}
        disabled={!wallet || !m || !price || col < 1 || col > credit || reserve > capacity || (type === "limit" && !(limitValue > 0))}
        onClick={submit}
      >
        {!wallet
          ? "Connect wallet"
          : col > credit
            ? "Deposit USDC below first"
            : reserve > capacity
              ? "Exceeds pool capacity"
              : type === "limit"
                ? `Place limit ${side} at ${limitValue ? fmtUsd(limitValue) : "…"}`
                : `${side === "long" ? "Long" : "Short"} ${symbol} ${lev.toFixed(1)}×${insure && insurance.quote ? " + insure" : ""}`}
      </Button>
      <p className="flex items-center gap-2 text-[11px] text-muted">
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-yes" /> Executes on MagicBlock in ~1s. Liquidation needs Pyth
        and Switchboard to agree.
      </p>
    </div>
  );
}

/** Prices a touch ticket at the liquidation price that repays the position's collateral. */
function useInsurance(symbol: AssetSymbol, side: Side, liq: number, collateral: number) {
  const markets = useMarkets();
  const now = useNow(5000);
  const tick = useLivePrice(symbol);
  const target = useMemo(() => {
    const candidates = (markets.data ?? []).filter(
      (r) => assetFromBytes(r.m.data.symbol)?.symbol === symbol && "open" in (r.m.data.status as object) && r.m.data.expiry.toNumber() > now + 3_600,
    );
    return candidates.sort((a, b) => b.m.data.expiry.toNumber() - a.m.data.expiry.toNumber())[0];
  }, [markets.data, symbol, now]);
  const book = useBook(target?.key);
  const b = book.data;
  const left = b ? b.expiry.toNumber() - now : 0;
  if (!target || !b) return { quote: null, reason: "No touch book is open for this asset right now.", left, market: undefined };
  if (!tick || !liq || collateral <= 0) return { quote: null, reason: "Enter a position to see the insurance price.", left, market: target.key };
  const fair = touchFairBps(side === "long" ? "down" : "up", tick.price, liq, 0, b.volBps, left);
  const priceBps = fair == null ? null : touchQuoteBps(fair, b.marginBps);
  if (priceBps == null) return { quote: null, reason: "Liquidation is too close to spot to insure.", left, market: target.key };
  const payout = collateral;
  const stake = Math.max(0.1, (payout * priceBps) / 10_000);
  return { quote: { stake, payout: (stake * 10_000) / priceBps, priceBps }, reason: "", left, market: target.key };
}

function Positions({ perps, refresh }: { perps: Perps; refresh: () => void }) {
  const wallet = useAnchorWallet();
  const { push } = useToast();
  const [busy, setBusy] = useState<string>();
  const acc = perps?.account?.data;
  const rows = acc
    ? PERP_SYMBOLS.flatMap((s) =>
        (["long", "short"] as Side[]).map((side) => ({ s, side, slot: acc.slots[slotIndex(s, side)] })),
      ).filter((r) => !r.slot.size.isZero())
    : [];
  return (
    <div className="panel p-5">
      <h3 className="font-display text-[24px] tracking-tight">Positions</h3>
      {!wallet ? (
        <p className="py-6 text-center text-[13px] text-muted">Connect a wallet to see positions.</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted">No open positions.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] tracking-wide text-muted uppercase">
                {["Market", "Size", "Entry", "Mark", "Liq. (both oracles)", "PnL", "Stop 🔒", ""].map((h) => (
                  <th key={h} className="pb-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <AnimatePresence>
                {rows.map((r) => (
                  <PositionRow
                    key={`${r.s}${r.side}`}
                    {...r}
                    m={perps!.markets[r.s]!.data}
                    busy={busy === `${r.s}${r.side}`}
                    onClose={async (mark, fraction) => {
                      if (!wallet) return;
                      setBusy(`${r.s}${r.side}`);
                      try {
                        const limit = r.side === "long" ? mark * (1 - SLIPPAGE) : mark * (1 + SLIPPAGE);
                        const sig = await closePerp(wallet, r.s, r.side, limit, fraction);
                        push({ kind: "ok", title: `Closed ${Math.round(fraction * 100)}% of ${r.s} ${r.side}`, sig, er: true });
                        refresh();
                      } catch (e) {
                        push({ kind: "err", title: "Close failed", body: (e as Error).message.slice(0, 160) });
                      } finally {
                        setBusy(undefined);
                      }
                    }}
                  />
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PositionRow({
  s,
  side,
  slot,
  m,
  busy,
  onClose,
}: {
  s: AssetSymbol;
  side: Side;
  slot: NonNullable<NonNullable<Perps>["account"]>["data"]["slots"][number];
  m: NonNullable<NonNullable<Perps>["markets"][AssetSymbol]>["data"];
  busy: boolean;
  onClose: (mark: number, fraction: number) => void;
}) {
  const wallet = useAnchorWallet();
  const { push } = useToast();
  const [margin, setMargin] = useState<string | null>(null);
  const t = useLivePrice(s);
  const size = slot.size.toNumber() / 1e6;
  const col = slot.collateral.toNumber() / 1e6;
  const entry = slot.entryPrice.toNumber() / 1e8;
  const owed = borrowOwed(size, slot.borrowIdx, m.borrowIdx);
  const liq = liqPrice(side, size, col, entry, m, owed);
  const mark = t?.price ?? entry;
  const p = Math.min(pnl(side, size, entry, mark), slot.reserve.toNumber() / 1e6) - owed;
  return (
    <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <td className="py-3">
        <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${side === "long" ? "bg-yes/15 text-yes" : "bg-no/15 text-no"}`}>
          {side}
        </span>
        {s} <span className="num text-muted">{(size / col).toFixed(1)}×</span>
      </td>
      <td className="num">${fmtNum(size)}</td>
      <td className="num">{fmtUsd(entry)}</td>
      <td className="num">{fmtUsd(mark)}</td>
      <td className="num text-flame-2">{fmtUsd(liq)}</td>
      <td className={`num ${p >= 0 ? "text-yes" : "text-no"}`}>
        {p >= 0 ? "+" : ""}${fmtNum(p)} <span className="text-[11px]">({((p / col) * 100).toFixed(1)}%)</span>
      </td>
      <td>
        <HiddenStop s={s} side={side} mark={mark} liq={liq} />
      </td>
      <td className="text-right whitespace-nowrap">
        {margin !== null ? (
          <span className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={margin}
              onChange={(e) => setMargin(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="USDC"
              className="num h-7 w-16 rounded-md border hairline bg-ink px-2 text-[12px] outline-none"
            />
            {([true, false] as const).map((add) => (
              <button
                key={String(add)}
                disabled={!Number(margin)}
                onClick={async () => {
                  try {
                    const sig = await adjustMargin(wallet!, s, side, add, Number(margin));
                    push({ kind: "ok", title: `${add ? "Added" : "Removed"} $${margin} margin`, sig, er: true });
                    setMargin(null);
                  } catch (e) {
                    push({ kind: "err", title: "Margin change failed", body: (e as Error).message.slice(0, 120) });
                  }
                }}
                className="rounded-md border hairline px-2 py-1 text-[11px] hover:border-line-2 disabled:opacity-40"
              >
                {add ? "+" : "−"}
              </button>
            ))}
            <button onClick={() => setMargin(null)} className="px-1 text-[11px] text-muted">
              ×
            </button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <button onClick={() => setMargin("")} className="rounded-md px-2 py-1 text-[11px] text-muted hover:text-paper" title="Add or remove margin">
              ±$
            </button>
            {[0.25, 0.5].map((f) => (
              <button
                key={f}
                disabled={busy}
                onClick={() => onClose(mark, f)}
                className="rounded-md px-1.5 py-1 text-[11px] text-muted hover:text-paper disabled:opacity-40"
              >
                {f * 100}%
              </button>
            ))}
            <button
              disabled={busy}
              onClick={() => onClose(mark, 1)}
              className="rounded-full border hairline px-3 py-1 text-[12px] hover:border-line-2 disabled:opacity-40"
            >
              {busy ? "…" : "Close"}
            </button>
          </span>
        )}
      </td>
    </motion.tr>
  );
}

function OpenOrders({ perps, refresh }: { perps: Perps; refresh: () => void }) {
  const wallet = useAnchorWallet();
  const { push } = useToast();
  const book = perps?.orders?.data;
  const rows = (book?.orders ?? []).map((o, i) => ({ o, i })).filter(({ o }) => !("none" in (o.kind as object)));
  if (!wallet || !rows.length) return null;
  const label = { limitOpen: "Limit open", takeProfit: "Take-profit", stopLoss: "Stop-loss" } as Record<string, string>;
  return (
    <div className="panel p-5">
      <h3 className="font-display text-[24px] tracking-tight">Open orders</h3>
      <div className="mt-2 divide-y divide-line">
        {rows.map(({ o, i }) => {
          const kind = Object.keys(o.kind)[0];
          return (
            <div key={i} className="flex items-center gap-4 py-3 text-[13px]">
              <span className="w-24 text-muted">{label[kind]}</span>
              <span className={o.isLong ? "text-yes" : "text-no"}>{o.isLong ? "Long" : "Short"}</span>
              <span>{PERP_SYMBOLS[o.marketIndex]}-PERP</span>
              <span className="num">@ {fmtUsd(o.trigger.toNumber() / 1e8)}</span>
              {kind === "limitOpen" && (
                <span className="num text-muted">
                  ${fmtNum(o.collateral.toNumber() / 1e6)} × {(o.leverageX10 / 10).toFixed(1)}
                </span>
              )}
              <button
                onClick={async () => {
                  try {
                    const sig = await cancelPerpOrder(wallet, i);
                    push({ kind: "ok", title: "Order cancelled", sig, er: true });
                    refresh();
                  } catch (e) {
                    push({ kind: "err", title: "Cancel failed", body: (e as Error).message.slice(0, 120) });
                  }
                }}
                className="ml-auto text-[12px] text-muted hover:text-paper"
              >
                Cancel
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Encrypted stop-loss: the level is encrypted in the browser and checked by Arcium MPC. */
function HiddenStop({ s, side, mark, liq }: { s: AssetSymbol; side: Side; mark: number; liq: number }) {
  const wallet = useAnchorWallet();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [px, setPx] = useState("");
  const [busy, setBusy] = useState(false);
  const stop = usePoll(
    async () => (wallet ? fetchHiddenStop(wallet.publicKey, s, side === "long") : null),
    6000,
    [wallet?.publicKey.toBase58(), s, side],
  );
  const st = stop.data;
  const value = Number(px);
  const valid = value > 0 && (side === "long" ? value < mark && value > liq : value > mark && value < liq);
  if (st?.armed && !open)
    return (
      <span className="flex items-center gap-2 text-[12px]">
        <span className={st.triggered ? "text-flame" : "text-violet"}>{st.triggered ? "hit · closing" : `armed · ${st.checks} checks`}</span>
        <button
          className="text-[11px] text-muted hover:text-paper"
          onClick={async () => {
            try {
              await cancelHiddenStop(wallet!, s, side === "long");
              stop.refresh();
            } catch (e) {
              push({ kind: "err", title: "Cancel failed", body: (e as Error).message.slice(0, 120) });
            }
          }}
        >
          ×
        </button>
      </span>
    );
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="text-[12px] text-violet hover:underline">
        set
      </button>
    );
  return (
    <span className="flex items-center gap-1.5">
      <input
        autoFocus
        value={px}
        onChange={(e) => setPx(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder={side === "long" ? `< ${mark.toFixed(2)}` : `> ${mark.toFixed(2)}`}
        className="num h-7 w-24 rounded-md border hairline bg-ink px-2 text-[12px] outline-none"
      />
      <button
        disabled={!valid || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const sig = await setHiddenStop(wallet!, s, side === "long", value);
            push({ kind: "ok", title: "Hidden stop armed", body: "Encrypted to Arcium; nobody can see your level.", sig });
            setOpen(false);
            stop.refresh();
          } catch (e) {
            push({ kind: "err", title: "Stop failed", body: (e as Error).message.slice(0, 120) });
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-md bg-violet px-2 py-1 text-[11px] font-semibold text-ink disabled:opacity-40"
      >
        {busy ? "…" : "🔒"}
      </button>
    </span>
  );
}

function AccountPanel({ perps, refresh }: { perps: Perps; refresh: () => void }) {
  const wallet = useAnchorWallet();
  const { push } = useToast();
  const usdc = useUsdc();
  const [amt, setAmt] = useState("100");
  const [busy, setBusy] = useState<string>();
  const acc = perps?.account?.data;
  const credit = acc ? acc.credit.toNumber() / 1e6 : 0;
  if (!wallet) return null;
  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label);
    try {
      const sig = await fn();
      push({ kind: "ok", title: label, sig });
      refresh();
      usdc.refresh();
    } catch (e) {
      push({ kind: "err", title: `${label} failed`, body: (e as Error).message.slice(0, 160) });
    } finally {
      setBusy(undefined);
    }
  };
  return (
    <div className="panel space-y-3 p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold">Trading account</span>
        <span className="num text-[13px]">${fmtNum(credit)} free</span>
      </div>
      <AmountInput label="Amount" value={amt} onChange={setAmt} max={usdc.data} />
      <div className="grid grid-cols-2 gap-2">
        <Button busy={busy === "Deposit"} disabled={!Number(amt)} onClick={() => run("Deposit", () => depositPerp(wallet, Number(amt)))}>
          Deposit
        </Button>
        <button
          disabled={!!busy || !Number(amt) || Number(amt) > credit}
          onClick={() => run("Withdraw", () => withdrawPerp(wallet, Number(amt)))}
          className="h-12 rounded-xl border hairline text-[14px] font-semibold hover:border-line-2 disabled:opacity-40"
        >
          {busy === "Withdraw" ? "…" : "Withdraw"}
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-faint">
        Deposits land once on Solana; after that every trade runs on the rollup. Provide liquidity on the{" "}
        <Link href="/liquidity" className="text-flame-2 hover:underline">
          LP pool
        </Link>
        .
      </p>
    </div>
  );
}

function MarketStats({ m, pool, price }: { m?: NonNullable<NonNullable<Perps>["markets"][AssetSymbol]>["data"]; pool?: NonNullable<NonNullable<Perps>["pool"]>["data"]; price?: number }) {
  const stats: [string, string][] = [
    ["Oracle price", price ? fmtUsd(price) : "—"],
    ["Long OI", m ? `$${fmtNum(m.longOi.toNumber() / 1e6, 0)}` : "—"],
    ["Short OI", m ? `$${fmtNum(m.shortOi.toNumber() / 1e6, 0)}` : "—"],
    ["Max leverage", m ? `${m.maxLeverage}×` : "—"],
    ["Maintenance", m ? `${(m.maintBps / 100).toFixed(2)}%` : "—"],
    ["Pool liquidity", pool ? `$${fmtNum(pool.liquidity.toNumber() / 1e6, 0)}` : "—"],
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border hairline bg-line sm:grid-cols-3 lg:grid-cols-6">
      {stats.map(([k, v]) => (
        <div key={k} className="bg-ink p-4">
          <div className="text-[10px] tracking-wide text-muted uppercase">{k}</div>
          <div className="num mt-1 text-[15px]">{v}</div>
        </div>
      ))}
    </div>
  );
}
