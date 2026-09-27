"use client";

import { motion } from "motion/react";
import { MarketCard } from "@/components/MarketCard";
import { Ticker } from "@/components/Ticker";
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
  return (
    <div>
      <section className="relative pt-16 pb-12 sm:pt-24">
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

      <section className="mt-16">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="font-display text-[36px] tracking-tight">Live markets</h2>
          <span className="text-[12px] text-muted">{data?.length ?? 0} markets</span>
        </div>
        {loading && !data ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="panel h-[228px] animate-pulse" />
            ))}
          </div>
        ) : data && data.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.map((r, i) => (
              <MarketCard key={r.key.toBase58()} k={r.key} m={r.m} i={i} />
            ))}
          </div>
        ) : (
          <div className="panel p-10 text-center text-muted">
            No markets yet. They appear here as soon as the house opens them on devnet.
          </div>
        )}
      </section>
    </div>
  );
}
