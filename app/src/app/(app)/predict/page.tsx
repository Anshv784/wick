"use client";

import { MarketCard } from "@/components/MarketCard";
import { Ticker } from "@/components/Ticker";
import { useMarkets } from "@/lib/hooks";

export default function Home() {
  const { data, loading } = useMarkets();
  const now = Date.now() / 1000;
  const isLive = (r: NonNullable<typeof data>[number]) =>
    "open" in (r.m.data.status as object) && r.m.data.expiry.toNumber() > now;
  const live = (data ?? []).filter(isLive);
  const resolved = (data ?? [])
    .filter((r) => !isLive(r))
    .sort((a, b) => b.m.data.expiry.toNumber() - a.m.data.expiry.toNumber());
  return (
    <div>
      <section className="pt-12">
        <p className="num text-[11px] tracking-wide text-flame-2 uppercase">Prediction markets</p>
        <h1 className="font-display mt-1 text-[48px] leading-none tracking-tight">Predict</h1>
        <p className="mt-3 max-w-xl text-[14px] text-muted">
          Will the price be above the strike at expiry? Trade YES/NO instantly on MagicBlock, bet on the path with touch tickets,
          or go sealed with Arcium. Every market settles on Pyth and Switchboard agreeing.
        </p>
        <Ticker />
      </section>

      <MarketsSection title="Live markets" rows={live} loading={loading && !data} empty="No live markets right now. The keeper opens a new one within minutes." />
      {resolved.length > 0 && <MarketsSection title="Recently resolved" rows={resolved.slice(0, 6)} />}
    </div>
  );
}

function MarketsSection({
  title,
  rows,
  loading,
  empty,
}: {
  title: string;
  rows: NonNullable<ReturnType<typeof useMarkets>["data"]>;
  loading?: boolean;
  empty?: string;
}) {
  return (
    <section className="mt-16">
      <div className="mb-5 flex items-baseline justify-between">
        <h2 className="font-display text-[36px] tracking-tight">{title}</h2>
        <span className="text-[12px] text-muted">{rows.length} markets</span>
      </div>
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="panel h-[228px] animate-pulse" />
          ))}
        </div>
      ) : rows.length ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((r, i) => (
            <MarketCard key={r.key.toBase58()} k={r.key} m={r.m} i={i} />
          ))}
        </div>
      ) : (
        <div className="panel p-10 text-center text-muted">{empty}</div>
      )}
    </section>
  );
}
