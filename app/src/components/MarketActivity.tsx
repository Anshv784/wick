"use client";

import { PublicKey } from "@solana/web3.js";
import { fetchMarketTrades } from "@/lib/activity";
import { fmtNum } from "@/lib/format";
import { usePoll } from "@/lib/hooks";

function ago(ts: number) {
  const s = Math.max(1, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** YES probability over time plus the latest fills, both from on-chain TradeEvents. */
export function MarketActivity({ market, currentYesBps }: { market: PublicKey; currentYesBps: number }) {
  const trades = usePoll(() => fetchMarketTrades(market), 8000, [market.toBase58()]);
  const rows = trades.data ?? [];
  const pts = [{ ts: rows[0]?.ts ?? Date.now() / 1000 - 3600, yes: 5000 }, ...rows.map((r) => ({ ts: r.ts, yes: r.yesBps }))];
  pts.push({ ts: Date.now() / 1000, yes: currentYesBps });
  const W = 520;
  const H = 150;
  const t0 = pts[0].ts;
  const t1 = pts[pts.length - 1].ts;
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const y = (bps: number) => H - (bps / 10_000) * H;
  // Step line: the probability holds until the next trade moves it.
  const d = pts.map((p, i) => (i === 0 ? `M${x(p.ts)},${y(p.yes)}` : `H${x(p.ts)} V${y(p.yes)}`)).join(" ");

  return (
    <div className="panel p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-[24px] tracking-tight">Probability</h3>
        <span className="num text-[13px] text-yes">{(currentYesBps / 100).toFixed(1)}% YES</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-[150px] w-full" preserveAspectRatio="none">
        <line x1="0" x2={W} y1={y(5000)} y2={y(5000)} stroke="#242428" strokeDasharray="4 5" />
        <path d={`${d} V${H} H0 Z`} fill="rgba(94,224,161,0.08)" />
        <path d={d} fill="none" stroke="#5ee0a1" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-4 text-[11px] tracking-wide text-muted uppercase">Recent trades</div>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-muted">{trades.loading ? "Loading…" : "No trades yet."}</p>
      ) : (
        <div className="mt-1 max-h-[180px] divide-y divide-line overflow-y-auto">
          {rows
            .slice()
            .reverse()
            .slice(0, 20)
            .map((r) => (
              <div key={r.sig + r.ts} className="num flex items-center gap-3 py-2 text-[12px]">
                <span className={r.isBuy ? "text-paper" : "text-muted"}>{r.isBuy ? "Buy" : "Sell"}</span>
                <span className={r.side === "yes" ? "text-yes" : "text-no"}>{r.side.toUpperCase()}</span>
                <span>${fmtNum(r.collateral)}</span>
                <span className="text-muted">{fmtNum(r.shares)} sh</span>
                <span className="ml-auto text-muted">
                  → {(r.yesBps / 100).toFixed(1)}% · {ago(r.ts)}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
