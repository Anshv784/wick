"use client";

import { PublicKey } from "@solana/web3.js";
import { fmtNum, fmtUsd } from "@/lib/format";
import { usePoll } from "@/lib/hooks";
import { PERP_SYMBOLS } from "@/lib/perps";
import { fpmmBuy } from "@/lib/pricing";
import { erConn, marketsProgram } from "@/lib/wick";
import type { AssetSymbol } from "@/lib/assets";

type Level = { price: number; size: number; count: number };

function Ladder({ asks, bids, mid, midLabel, unit }: { asks: Level[]; bids: Level[]; mid: number | null; midLabel: string; unit: (p: number) => string }) {
  const cum = (xs: Level[]) => xs.reduce<number[]>((a, l) => [...a, (a[a.length - 1] ?? 0) + l.size], []);
  const askCum = cum(asks);
  const bidCum = cum(bids);
  const max = Math.max(1, askCum[askCum.length - 1] ?? 0, bidCum[bidCum.length - 1] ?? 0);
  const Row = ({ l, c, side }: { l: Level; c: number; side: "ask" | "bid" }) => (
    <div className="num relative grid grid-cols-3 px-4 py-1 text-[12px]">
      <span
        className={`absolute inset-y-0 right-0 ${side === "ask" ? "bg-no/10" : "bg-yes/10"}`}
        style={{ width: `${(c / max) * 100}%` }}
      />
      <span className={`relative ${side === "ask" ? "text-no" : "text-yes"}`}>{unit(l.price)}</span>
      <span className="relative text-right">${fmtNum(l.size, 0)}</span>
      <span className="relative text-right text-muted">${fmtNum(c, 0)}</span>
    </div>
  );
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 px-4 py-2 text-[10px] tracking-wide text-muted uppercase">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>
      <div className="flex flex-1 flex-col justify-end overflow-hidden">
        {asks
          .map((l, i) => ({ l, c: askCum[i] }))
          .reverse()
          .map(({ l, c }) => (
            <Row key={`a${l.price}`} l={l} c={c} side="ask" />
          ))}
      </div>
      <div className="num flex items-center justify-between border-y hairline bg-ink-3/60 px-4 py-2 text-[13px]">
        <span className="text-paper">{mid != null ? unit(mid) : "—"}</span>
        <span className="text-[11px] text-muted">{midLabel}</span>
      </div>
      <div className="flex-1 overflow-hidden">
        {bids.map((l, i) => (
          <Row key={`b${l.price}`} l={l} c={bidCum[i]} side="bid" />
        ))}
      </div>
    </div>
  );
}

/**
 * Perps fill at the oracle, so there's no maker/taker book. What does rest on-chain are limit
 * orders: long limits below the mark (bids) and short limits above it (asks).
 */
export function PerpDepth({ symbol, mark }: { symbol: AssetSymbol; mark?: number }) {
  const index = PERP_SYMBOLS.indexOf(symbol);
  const book = usePoll(
    async () => {
      const program = marketsProgram(erConn);
      const all = await program.account.perpOrders.all([{ dataSize: program.account.perpOrders.size }]);
      const bids = new Map<number, Level>();
      const asks = new Map<number, Level>();
      for (const { account } of all)
        for (const o of account.orders) {
          if (!("limitOpen" in (o.kind as object)) || o.marketIndex !== index) continue;
          const price = Math.round(o.trigger.toNumber() / 1e6) / 100; // group to cents
          const size = (o.collateral.toNumber() / 1e6) * (o.leverageX10 / 10);
          const m = o.isLong ? bids : asks;
          const l = m.get(price) ?? { price, size: 0, count: 0 };
          l.size += size;
          l.count += 1;
          m.set(price, l);
        }
      return {
        bids: [...bids.values()].sort((a, b) => b.price - a.price).slice(0, 12),
        asks: [...asks.values()].sort((a, b) => a.price - b.price).slice(0, 12),
      };
    },
    5000,
    [symbol],
  );
  const empty = book.data && !book.data.bids.length && !book.data.asks.length;
  return (
    <div className="relative h-full">
      <Ladder asks={book.data?.asks ?? []} bids={book.data?.bids ?? []} mid={mark ?? null} midLabel="oracle mark · market orders fill here" unit={(p) => fmtUsd(p)} />
      {empty && (
        <p className="pointer-events-none absolute inset-x-0 top-1/4 px-8 text-center text-[12px] leading-relaxed text-muted">
          No resting limit orders on {symbol}-PERP yet. Market orders fill at the Pyth price with no spread; place a limit order
          and it shows up here.
        </p>
      )}
    </div>
  );
}

/** Pool depth for a prediction market: what it costs to move YES, plus resting limit orders. */
export function PoolDepth({ market, yesReserve, noReserve, feeBps }: { market: PublicKey; yesReserve: number; noReserve: number; feeBps: number }) {
  const resting = usePoll(
    async () => {
      const program = marketsProgram(erConn);
      const all = await program.account.poolOrders.all([
        { dataSize: program.account.poolOrders.size },
        { memcmp: { offset: 8 + 32, bytes: market.toBase58() } },
      ]);
      const out: { yesCents: number; usd: number; isBid: boolean }[] = [];
      for (const { account } of all)
        for (const o of account.orders)
          if (o.active) {
            // Normalise to the YES book: buying NO at x¢ is selling YES at (100 − x)¢.
            const cents = o.isYes ? o.limitBps / 100 : 100 - o.limitBps / 100;
            const isBid = o.isYes === o.isBuy;
            out.push({ yesCents: cents, usd: o.amount.toNumber() / 1e6, isBid });
          }
      return out;
    },
    6000,
    [market.toBase58()],
  );
  // Pool curve: cumulative USDC needed to push YES to each level, both directions.
  const steps = [5, 10, 25, 50, 100, 250, 500, 1000];
  const net = (usd: number) => Math.floor(usd * 1e6 * (1 - feeBps / 10_000));
  const up = steps.map((usd) => {
    const r = fpmmBuy(yesReserve, noReserve, net(usd));
    return { price: (r.newOther * 100) / (r.newSide + r.newOther), size: usd, count: 1 };
  });
  const down = steps.map((usd) => {
    const r = fpmmBuy(noReserve, yesReserve, net(usd));
    return { price: (r.newSide * 100) / (r.newSide + r.newOther), size: usd, count: 1 };
  });
  const toLevels = (xs: { price: number; size: number }[]) => {
    const out: Level[] = [];
    let prev = 0;
    for (const x of xs) {
      out.push({ price: x.price, size: x.size - prev, count: 1 });
      prev = x.size;
    }
    return out;
  };
  // Resting limit orders sit on top of the pool curve at their own price.
  const rest = (isBid: boolean): Level[] =>
    (resting.data ?? []).filter((r) => r.isBid === isBid).map((r) => ({ price: r.yesCents, size: r.usd, count: 1 }));
  const mid = (noReserve * 100) / (yesReserve + noReserve);
  return (
    <Ladder
      asks={[...toLevels(up), ...rest(false)].sort((a, b) => a.price - b.price)}
      bids={[...toLevels(down), ...rest(true)].sort((a, b) => b.price - a.price)}
      mid={mid}
      midLabel="pool price · YES"
      unit={(p) => `${p.toFixed(1)}¢`}
    />
  );
}
