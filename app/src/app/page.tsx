"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "motion/react";
import { ReactNode, useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { marketQuestion } from "@/components/MarketCard";
import { ASSETS, AssetSymbol } from "@/lib/assets";
import { countdown, fmtUsd } from "@/lib/format";
import { useMarkets } from "@/lib/hooks";
import { yesBps } from "@/lib/pricing";
import { useLivePrice, useSwitchboardPrice } from "@/lib/prices";

// WebGL only on the client.
const CandleScene = dynamic(() => import("@/components/landing/CandleScene").then((m) => m.CandleScene), {
  ssr: false,
});

const fade = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.7, ease: [0.2, 0.7, 0.2, 1] as const },
};

export default function Landing() {
  return (
    <div className="overflow-x-clip">
      <Hero />
      <Perps />
      <Modes />
      <LiveStrip />
      <Settlement />
      <Stack />
      <FinalCta />
      <Footer />
    </div>
  );
}

function LaunchButton({ big }: { big?: boolean }) {
  return (
    <Link
      href="/markets"
      className={`group inline-flex items-center gap-2 rounded-full bg-paper font-semibold text-ink transition hover:bg-white ${big ? "h-14 px-8 text-[16px]" : "h-11 px-5 text-[14px]"}`}
    >
      Launch app
      <span className="transition group-hover:translate-x-0.5">→</span>
    </Link>
  );
}

function Hero() {
  const sol = useLivePrice("SOL");
  return (
    <section className="relative h-[100svh] min-h-[640px] w-full">
      <CandleScene />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(10,10,11,0.97)_0%,rgba(10,10,11,0.85)_35%,rgba(10,10,11,0.2)_62%,transparent_80%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink to-transparent" />

      <header className="relative z-10 mx-auto flex h-20 max-w-[1280px] items-center gap-8 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={24} />
          <span className="font-display text-[28px] leading-none tracking-tight">Wick</span>
        </Link>
        <nav className="hidden items-center gap-6 text-[13px] text-muted md:flex">
          <a href="#perps" className="hover:text-paper">Perps</a>
          <a href="#modes" className="hover:text-paper">Markets</a>
          <a href="#settlement" className="hover:text-paper">Settlement</a>
          <Link href="/docs" className="hover:text-paper">Docs</Link>
        </nav>
        <div className="ml-auto">
          <LaunchButton />
        </div>
      </header>

      <div className="relative z-10 mx-auto flex h-[calc(100%-5rem)] max-w-[1280px] flex-col justify-center px-4 pb-24 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-7 inline-flex w-fit items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[12px] text-muted backdrop-blur"
        >
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-yes" />
          Live on Solana devnet
          <span className="text-faint">·</span>
          <span className="num text-paper">SOL {sol ? fmtUsd(sol.price) : "…"}</span>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.15, ease: [0.2, 0.7, 0.2, 1] }}
          className="font-display max-w-3xl text-[64px] leading-[0.92] tracking-tight sm:text-[104px]"
        >
          Trade the <em className="text-flame">wick</em>,<br />
          not just the close.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.35 }}
          className="mt-7 max-w-lg text-[17px] leading-relaxed text-muted"
        >
          Perps up to 50× that a single bad print can&apos;t liquidate, and prediction markets where you bet on the path a price
          takes. Nothing moves money until <span className="text-paper">Pyth</span> and{" "}
          <span className="text-paper">Switchboard</span> agree.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-10 flex flex-wrap items-center gap-3"
        >
          <LaunchButton big />
          <Link
            href="/docs"
            className="inline-flex h-14 items-center rounded-full border border-white/12 px-7 text-[15px] text-paper backdrop-blur transition hover:border-white/30"
          >
            How it works
          </Link>
        </motion.div>
      </div>

      <motion.a
        href="#modes"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
        className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-[11px] tracking-[0.2em] text-faint uppercase hover:text-muted"
      >
        Scroll
      </motion.a>
    </section>
  );
}

function Perps() {
  const features = [
    {
      k: "Wick-proof liquidations",
      v: "A position is only liquidated when Pyth and Switchboard both put it under maintenance. One feed's flash wick can't wipe you out.",
    },
    {
      k: "Up to 50×, in about a second",
      v: "SOL, BTC and ETH perps execute on a MagicBlock rollup against an LP pool: no gas, no waiting for blocks.",
    },
    {
      k: "Liquidation insurance",
      v: "One click buys a touch ticket at your liquidation price. If you do get liquidated, it pays your collateral back.",
    },
    {
      k: "Stops nobody can hunt",
      v: "Stop-losses are encrypted in your browser. Arcium checks them against the oracle and reveals only whether they fired.",
    },
  ];
  return (
    <section id="perps" className="mx-auto max-w-[1280px] scroll-mt-10 px-4 pt-28 sm:px-6">
      <div className="grid items-start gap-14 lg:grid-cols-[1fr_1.1fr]">
        <motion.div {...fade}>
          <p className="num text-[12px] tracking-wide text-flame-2 uppercase">Perpetuals</p>
          <h2 className="font-display mt-3 text-[48px] leading-[1] tracking-tight sm:text-[64px]">
            Leverage that survives <em className="text-flame">the wick</em>.
          </h2>
          <p className="mt-6 max-w-md text-[16px] leading-relaxed text-muted">
            Most liquidations aren&apos;t about where the price goes. They&apos;re about one bad tick on one feed. Wick won&apos;t close
            your position until two independent oracles agree it should.
          </p>
          <Link
            href="/perps"
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-flame px-6 text-[14px] font-semibold text-ink transition hover:brightness-110"
          >
            Trade perps →
          </Link>
        </motion.div>
        <div className="grid gap-3 sm:grid-cols-2">
          {features.map((f, i) => (
            <motion.div key={f.k} {...fade} transition={{ ...fade.transition, delay: i * 0.08 }} className="panel p-5">
              <div className="num text-[11px] text-flame-2">0{i + 1}</div>
              <div className="mt-2 text-[16px] font-semibold tracking-tight">{f.k}</div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{f.v}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Modes() {
  return (
    <section id="modes" className="mx-auto max-w-[1280px] scroll-mt-10 px-4 py-28 sm:px-6">
      <motion.div {...fade}>
        <p className="num text-[12px] tracking-wide text-flame-2 uppercase">Prediction markets · three ways in</p>
        <h2 className="font-display mt-3 max-w-2xl text-[48px] leading-[1] tracking-tight sm:text-[64px]">
          Every question, <em className="text-muted">your way</em>.
        </h2>
      </motion.div>
      <div className="mt-14 grid gap-4 lg:grid-cols-3">
        <ModeCard
          i={0}
          tag="Instant"
          sub="MagicBlock ephemeral rollup"
          color="text-ice"
          title="Trade YES/NO in a second"
          body="Your market is delegated to a rollup, so every buy and sell confirms in about a second with no gas. Everything is committed back to Solana to settle."
          visual={<InstantVisual />}
        />
        <ModeCard
          i={1}
          tag="Touch"
          sub="Path bets"
          color="text-flame-2"
          title="Bet on the wick"
          body="Pick a level. If the price trades through it at any moment before expiry, you're paid, whether or not it closes there. The payout is locked the moment you buy."
          visual={<TouchVisual />}
        />
        <ModeCard
          i={2}
          tag="Sealed"
          sub="Arcium MPC"
          color="text-violet"
          title="Orders nobody can read"
          body="Side and size are encrypted in your browser. The Arcium cluster matches the batch at one price and reveals only the totals, so there's nothing to front-run."
          visual={<SealedVisual />}
        />
      </div>
    </section>
  );
}

function ModeCard({
  i,
  tag,
  sub,
  color,
  title,
  body,
  visual,
}: {
  i: number;
  tag: string;
  sub: string;
  color: string;
  title: string;
  body: string;
  visual: ReactNode;
}) {
  return (
    <motion.div {...fade} transition={{ ...fade.transition, delay: i * 0.1 }} className="panel group overflow-hidden">
      <div className="relative h-44 overflow-hidden border-b hairline bg-ink">{visual}</div>
      <div className="p-6">
        <div className="flex items-baseline gap-2">
          <span className={`text-[13px] font-semibold ${color}`}>{tag}</span>
          <span className="text-[11px] text-faint">{sub}</span>
        </div>
        <h3 className="mt-2 text-[20px] font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{body}</p>
      </div>
    </motion.div>
  );
}

function InstantVisual() {
  const [yes, setYes] = useState(54);
  useEffect(() => {
    const t = setInterval(() => setYes((v) => Math.max(20, Math.min(80, v + (Math.random() - 0.5) * 9))), 1100);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex h-full flex-col justify-center gap-4 px-7">
      <div className="flex items-end justify-between">
        <span className="num text-[40px] leading-none">{yes.toFixed(0)}%</span>
        <span className="num rounded-full bg-ice/10 px-2.5 py-1 text-[11px] text-ice">~1s · 0 gas</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-no/25">
        <motion.div className="h-full rounded-full bg-yes" animate={{ width: `${yes}%` }} transition={{ type: "spring", stiffness: 90, damping: 16 }} />
      </div>
      <div className="flex justify-between text-[11px] text-muted">
        <span>YES {(yes).toFixed(0)}¢</span>
        <span>NO {(100 - yes).toFixed(0)}¢</span>
      </div>
    </div>
  );
}

function TouchVisual() {
  const pts = [62, 58, 60, 52, 55, 48, 50, 41, 44, 36, 39, 30, 34, 22, 27, 33, 29, 38, 35, 42];
  const d = pts.map((y, i) => `${i === 0 ? "M" : "L"}${10 + i * 20},${y + 50}`).join(" ");
  return (
    <svg viewBox="0 0 400 176" className="h-full w-full">
      <line x1="0" x2="400" y1="78" y2="78" stroke="#ff7a1a" strokeDasharray="5 6" />
      <text x="392" y="70" textAnchor="end" className="num" fill="#ffb266" fontSize="11">
        touch ↑
      </text>
      <motion.path
        d={d}
        fill="none"
        stroke="#f3efe6"
        strokeWidth="2"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 2, ease: "easeInOut" }}
      />
      <motion.circle
        cx={10 + 13 * 20}
        cy={72}
        r="16"
        fill="#ff7a1a"
        opacity="0.25"
        initial={{ scale: 0 }}
        whileInView={{ scale: [0, 1.4, 1] }}
        viewport={{ once: true }}
        transition={{ delay: 1.35, duration: 0.6 }}
      />
      <motion.circle cx={10 + 13 * 20} cy={72} r="4" fill="#ff7a1a" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 1.3 }} />
    </svg>
  );
}

function SealedVisual() {
  const [rows, setRows] = useState<string[]>(["", "", ""]);
  useEffect(() => {
    const hex = () => Array.from({ length: 28 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    const t = setInterval(() => setRows([hex(), hex(), hex()]), 140);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex h-full flex-col justify-center gap-2 px-7">
      {rows.map((r, i) => (
        <div key={i} className="num flex items-center gap-3 text-[12px]">
          <span className="text-faint">order {i + 1}</span>
          <span className="truncate text-violet/80">{r}</span>
        </div>
      ))}
      <div className="num mt-2 text-[12px] text-muted">
        revealed: <span className="text-yes">YES $30</span> · <span className="text-no">NO $15</span> → 66.7¢
      </div>
    </div>
  );
}

function LiveStrip() {
  const { data } = useMarkets();
  const live = (data ?? []).filter((r) => "open" in (r.m.data.status as object) && r.m.data.expiry.toNumber() > Date.now() / 1000);
  return (
    <section className="border-y hairline bg-ink-2/50">
      <div className="mx-auto max-w-[1280px] px-4 py-16 sm:px-6">
        <motion.div {...fade} className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="num text-[12px] tracking-wide text-flame-2 uppercase">Right now</p>
            <h2 className="font-display mt-2 text-[40px] leading-none tracking-tight">Live markets</h2>
          </div>
          <Link href="/markets" className="text-[13px] text-muted hover:text-paper">
            All markets →
          </Link>
        </motion.div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {(live.length ? live : Array.from({ length: 4 }, () => null)).slice(0, 4).map((r, i) =>
            r ? <MiniMarket key={r.key.toBase58()} r={r} i={i} /> : <div key={i} className="panel h-[132px] animate-pulse" />,
          )}
        </div>
      </div>
    </section>
  );
}

function MiniMarket({ r, i }: { r: NonNullable<ReturnType<typeof useMarkets>["data"]>[number]; i: number }) {
  const q = marketQuestion(r.m.data);
  const yes = yesBps(r.m.data.yesReserve.toNumber(), r.m.data.noReserve.toNumber());
  const left = r.m.data.expiry.toNumber() - Date.now() / 1000;
  return (
    <motion.div {...fade} transition={{ ...fade.transition, delay: i * 0.06 }}>
      <Link href={`/market/${r.key.toBase58()}`} className="panel block p-5 transition hover:border-line-2 hover:bg-white/[0.03]">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full" style={{ background: q.asset?.color }} />
          <span className="text-[14px] font-semibold">{q.text}</span>
          <span className="num ml-auto text-[11px] text-muted">{countdown(left)}</span>
        </div>
        <div className="mt-4 flex items-end justify-between">
          <span className="num text-[30px] leading-none">{(yes / 100).toFixed(0)}%</span>
          <span className="text-[11px] text-muted">chance YES</span>
        </div>
        <div className="mt-3 flex h-1 overflow-hidden rounded-full bg-no/25">
          <div className="h-full bg-yes" style={{ width: `${yes / 100}%` }} />
        </div>
      </Link>
    </motion.div>
  );
}

function Settlement() {
  const sol = useLivePrice("SOL");
  const sb = useSwitchboardPrice("SOL");
  return (
    <section id="settlement" className="mx-auto max-w-[1280px] scroll-mt-10 px-4 py-28 sm:px-6">
      <div className="grid items-center gap-16 lg:grid-cols-2">
        <motion.div {...fade}>
          <p className="num text-[12px] tracking-wide text-flame-2 uppercase">Settlement</p>
          <h2 className="font-display mt-3 text-[48px] leading-[1] tracking-tight sm:text-[60px]">
            Two oracles.
            <br />
            <em className="text-muted">One verdict.</em>
          </h2>
          <p className="mt-6 max-w-md text-[16px] leading-relaxed text-muted">
            Every payout reads a Wormhole-verified Pyth price and an Ed25519-verified Switchboard quote built only from exchange
            APIs. They must land on the same side of the strike, close together. If they don&apos;t, the market freezes instead of
            paying the wrong side, and never gets stuck.
          </p>
          <Link href="/docs#settlement" className="mt-8 inline-block text-[14px] text-flame-2 hover:underline">
            Read the settlement rules →
          </Link>
        </motion.div>
        <motion.div {...fade} className="panel relative p-6">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <Oracle name="Pyth" sub="Wormhole-verified" v={sol?.price} />
            <div className="flex flex-col items-center gap-2">
              <motion.span
                className="h-px w-10 bg-gradient-to-r from-transparent via-flame to-transparent"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 2 }}
              />
              <span className="rounded-full border border-yes/40 px-3 py-1 text-[11px] font-semibold text-yes">
                {sol && sb ? `Δ ${((Math.abs(sol.price - sb) / Math.min(sol.price, sb)) * 100).toFixed(3)}%` : "live"}
              </span>
              <motion.span
                className="h-px w-10 bg-gradient-to-r from-transparent via-flame to-transparent"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 2, delay: 1 }}
              />
            </div>
            <Oracle name="Switchboard" sub="Coinbase · Kraken · Bitstamp" v={sb} />
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3 border-t hairline pt-5 text-[12px]">
            {[
              ["Same side of the strike", "rule 1"],
              ["Gap ≤ 0.5%", "rule 2"],
              ["Printed within 5 min of expiry", "rule 3"],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="num text-flame-2">{v}</div>
                <div className="mt-1 text-muted">{k}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Oracle({ name, sub, v }: { name: string; sub: string; v?: number }) {
  return (
    <div className="rounded-xl bg-ink p-4">
      <div className="text-[14px] font-semibold">{name}</div>
      <div className="text-[10px] text-faint">{sub}</div>
      <div className="num mt-4 text-[20px]">{v ? fmtUsd(v) : "—"}</div>
      <div className="text-[11px] text-muted">SOL/USD</div>
    </div>
  );
}

function Stack() {
  const items = ["Solana", "MagicBlock", "Arcium", "Pyth", "Switchboard"];
  return (
    <section className="border-y hairline">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-center gap-x-14 gap-y-4 px-4 py-10 sm:px-6">
        <span className="text-[11px] tracking-[0.2em] text-faint uppercase">Built on</span>
        {items.map((x) => (
          <span key={x} className="font-display text-[26px] text-muted">
            {x}
          </span>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative mx-auto max-w-[1280px] px-4 py-32 text-center sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,122,26,0.12),transparent_60%)]" />
      <motion.div {...fade} className="relative flex flex-col items-center">
        <Logo size={40} />
        <h2 className="font-display mx-auto mt-6 max-w-3xl text-[52px] leading-[1] tracking-tight sm:text-[76px]">
          The market never closes. <em className="text-flame">Neither do the wicks.</em>
        </h2>
        <div className="mt-10 flex justify-center">
          <LaunchButton big />
        </div>
        <p className="mt-5 text-[12px] text-faint">Devnet · free test USDC inside</p>
      </motion.div>
    </section>
  );
}

function Footer() {
  const syms = Object.keys(ASSETS) as AssetSymbol[];
  return (
    <footer className="border-t hairline">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-6 px-4 py-8 text-[12px] text-muted sm:px-6">
        <span className="flex items-center gap-2">
          <Logo size={16} /> Wick
        </span>
        <span className="text-faint">{syms.join(" · ")} markets</span>
        <span className="ml-auto flex gap-5">
          <Link href="/perps" className="hover:text-paper">Perps</Link>
          <Link href="/markets" className="hover:text-paper">Markets</Link>
          <Link href="/docs" className="hover:text-paper">Docs</Link>
          <Link href="/portfolio" className="hover:text-paper">Portfolio</Link>
        </span>
      </div>
    </footer>
  );
}
