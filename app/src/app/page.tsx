"use client";

import { motion } from "motion/react";
import { MarketCard } from "@/components/MarketCard";
import { Ticker } from "@/components/Ticker";
import { HeroWick } from "@/components/HeroWick";
import { useMarkets } from "@/lib/hooks";

const pillars = [
  {
    tag: "01 · Instant",
    title: "Pool trading on an ephemeral rollup",
    body: "Buy and sell YES/NO against an FPMM pool running on MagicBlock. No fees, no waiting for blocks.",
    color: "text-ice",
  },
  {
    tag: "02 · Touch",
    title: "Bet on the path, not just the close",
    body: "Pick any level. If the price trades through it before expiry, you're paid the moment both oracles agree.",
    color: "text-flame-2",
  },
  {
    tag: "03 · Sealed",
    title: "Orders nobody can read",
    body: "Arcium MPC matches encrypted orders at one clearing price. Only the batch totals are ever revealed.",
    color: "text-violet",
  },
];

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
      <section className="relative pt-16 pb-12 sm:pt-24">
        <div className="pointer-events-none absolute top-24 right-0 hidden xl:block">
          <HeroWick />
        </div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-5 text-[12px] tracking-[0.2em] text-muted uppercase"
        >
          Prediction markets · Solana
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="font-display max-w-4xl text-[56px] leading-[0.95] tracking-tight sm:text-[92px]"
        >
          Trade the <em className="text-flame">wick</em>,<br />
          not just the close.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="mt-7 max-w-xl text-[16px] leading-relaxed text-muted"
        >
          Every market settles only when <span className="text-paper">Pyth</span> and{" "}
          <span className="text-paper">Switchboard</span> independently agree. If they don&apos;t,
          it freezes rather than pay the wrong side.
        </motion.p>
        <Ticker />
      </section>

      <section className="grid gap-px overflow-hidden rounded-2xl border hairline bg-line md:grid-cols-3">
        {pillars.map((p) => (
          <div key={p.tag} className="bg-ink p-6">
            <div className={`num text-[11px] ${p.color}`}>{p.tag}</div>
            <div className="mt-3 text-[17px] font-semibold tracking-tight">{p.title}</div>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">{p.body}</p>
          </div>
        ))}
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
