"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Architecture } from "@/components/Architecture";
import { Logo, Wordmark } from "@/components/Logo";
import { marketQuestion } from "@/components/MarketCard";
import { WickSimulator } from "@/components/landing/WickSimulator";
import { ASSETS, AssetSymbol } from "@/lib/assets";
import { countdown, fmtCompact, fmtUsd } from "@/lib/format";
import { useMarkets, usePoll } from "@/lib/hooks";
import { fetchPerps } from "@/lib/perps";
import { yesBps } from "@/lib/pricing";
import { useLivePrice } from "@/lib/prices";
import { play, useSound } from "@/lib/sound";

const HeroShader = dynamic(() => import("@/components/landing/HeroShader").then((m) => m.HeroShader), { ssr: false });

const ease = [0.2, 0.7, 0.2, 1] as const;
const rise = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.8, ease },
};

export default function Landing() {
  return (
    <div className="overflow-x-clip bg-[#060607]">
      <TopBar />
      <Hero />
      <DemoVideo />
      <Simulator />
      <Bento />
      <HowItWorks />
      <LiveMarkets />
      <LogoMarquee />
      <FinalCta />
      <Footer />
    </div>
  );
}

/* ================================================================== chrome */

function Launch({ big, label = "Launch app" }: { big?: boolean; label?: string }) {
  return (
    <Link
      href="/perps"
      onMouseEnter={() => play("hover")}
      onClick={() => play("ignite")}
      className={`group relative inline-flex items-center gap-2 overflow-hidden rounded-full font-semibold text-ink transition ${big ? "h-14 px-8 text-[16px]" : "h-10 px-5 text-[13px]"}`}
    >
      <span className="absolute inset-0 bg-gradient-to-r from-[#ffd08a] via-[#ff7a1a] to-[#ff2e63]" />
      <span className="absolute inset-0 bg-white/0 transition group-hover:bg-white/15" />
      <span className="relative">{label}</span>
      <span className="relative transition group-hover:translate-x-0.5">→</span>
    </Link>
  );
}

function SoundToggle() {
  const [on, set] = useSound();
  return (
    <button
      onClick={() => set(!on)}
      title={on ? "Sound on" : "Sound off"}
      className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-white/50 transition hover:text-white"
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 8v4h3l4 3V5L6 8H3Z" fill="currentColor" stroke="none" />
        {on ? (
          <>
            <path d="M13 7.5a3.5 3.5 0 0 1 0 5" />
            <path d="M15.3 5.3a6.5 6.5 0 0 1 0 9.4" />
          </>
        ) : (
          <path d="M13.5 7.5l4 5m0-5-4 5" />
        )}
      </svg>
    </button>
  );
}

function TickerItem({ s }: { s: AssetSymbol }) {
  const t = useLivePrice(s);
  return (
    <span className="flex shrink-0 items-center gap-2">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: ASSETS[s].color }} />
      <span className="text-white/60">{s}-PERP</span>
      <span className="num text-white">{t ? fmtUsd(t.price) : "—"}</span>
      <span className="num rounded bg-white/10 px-1 text-[10px] text-flame-2">50×</span>
    </span>
  );
}

function TopBar() {
  const markets = useMarkets();
  const live = (markets.data ?? []).filter((r) => "open" in (r.m.data.status as object) && r.m.data.expiry.toNumber() > Date.now() / 1000);
  const items = (
    <>
      {(Object.keys(ASSETS) as AssetSymbol[]).map((s) => (
        <TickerItem key={s} s={s} />
      ))}
      {live.map((r) => {
        const q = marketQuestion(r.m.data);
        return (
          <span key={r.key.toBase58()} className="flex shrink-0 items-center gap-2">
            <span className="text-white/60">{q.text}?</span>
            <span className="num text-yes">{(yesBps(r.m.data.yesReserve.toNumber(), r.m.data.noReserve.toNumber()) / 100).toFixed(0)}% YES</span>
          </span>
        );
      })}
    </>
  );
  return (
    <div className="relative z-30 border-b border-white/5 bg-black/60 text-[12px]">
      <div className="flex h-9 items-center overflow-hidden">
        <Link
          href="/perps"
          className="z-10 flex h-full shrink-0 items-center gap-2 bg-gradient-to-r from-[#ff7a1a] to-[#ff2e63] px-4 font-semibold text-ink"
        >
          ● LIVE on devnet: wick-proof perps up to 50× →
        </Link>
        <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_4%,black_96%,transparent)]">
          <div className="flex w-max animate-[marquee_45s_linear_infinite] gap-10 pl-10">
            {items}
            {items}
          </div>
        </div>
      </div>
    </div>
  );
}

function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <div className="fixed inset-x-0 top-11 z-40 flex justify-center px-4">
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.6, ease }}
        className={`flex w-full max-w-[1120px] items-center gap-6 rounded-full border px-3 py-2 pl-5 backdrop-blur-xl transition-colors ${scrolled ? "border-white/10 bg-black/60" : "border-transparent bg-transparent"}`}
      >
        <Link href="/" onMouseEnter={() => play("hover")}>
          <Wordmark size={24} />
        </Link>
        <div className="hidden items-center gap-1 text-[13px] text-white/60 md:flex">
          {[
            ["Perps", "/perps"],
            ["Predictions", "/predictions"],
            ["Liquidity", "/liquidity"],
            ["Docs", "/docs"],
          ].map(([l, h]) => (
            <Link key={h} href={h} onMouseEnter={() => play("hover")} className="rounded-full px-3 py-1.5 transition hover:bg-white/5 hover:text-white">
              {l}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <SoundToggle />
          <Launch />
        </div>
      </motion.nav>
    </div>
  );
}

/* ================================================================== hero */

function Stat({ k, v, d = 0 }: { k: string; v: string; d?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 + d * 0.08, duration: 0.6 }}>
      <div className="num text-[22px] text-white sm:text-[26px]">{v}</div>
      <div className="mt-1 text-[11px] tracking-[0.14em] text-white/45 uppercase">{k}</div>
    </motion.div>
  );
}

function Hero() {
  const sol = useLivePrice("SOL");
  const perps = usePoll(() => fetchPerps(), 15_000, []);
  const markets = useMarkets();
  const liq = perps.data?.pool?.data.liquidity.toNumber();
  const liveMarkets = (markets.data ?? []).filter((r) => "open" in (r.m.data.status as object)).length;
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const yText = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <section ref={ref} className="relative h-[100svh] min-h-[720px] w-full">
      <HeroShader />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(6,6,7,0.92)_0%,rgba(6,6,7,0.55)_42%,transparent_70%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#060607] to-transparent" />
      <LandingNav />

      <motion.div style={{ y: yText, opacity: fade }} className="relative z-10 mx-auto flex h-full max-w-[1200px] flex-col justify-center px-5 pt-16 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-8 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pr-4 pl-1 text-[12px] text-white/70 backdrop-blur"
        >
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">NEW</span>
          Perps and prediction markets, settled only when two oracles agree
        </motion.div>

        <h1 className="font-display max-w-[900px] text-[clamp(56px,9vw,132px)] leading-[0.86] font-extrabold tracking-[-0.05em] text-white">
          {["Trade", "the", "wick."].map((w, i) => (
            <motion.span
              key={w}
              className="mr-[0.22em] inline-block"
              initial={{ opacity: 0, y: 60, filter: "blur(12px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: 0.35 + i * 0.12, duration: 0.9, ease }}
            >
              {w === "wick." ? (
                <span className="bg-gradient-to-br from-[#ffd08a] via-[#ff7a1a] to-[#ff2e63] bg-clip-text text-transparent">{w}</span>
              ) : (
                w
              )}
            </motion.span>
          ))}
          <motion.span
            className="font-serif mt-3 block text-[0.52em] font-normal tracking-[-0.02em] text-white/55 italic"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.9, ease }}
          >
            Don&apos;t get liquidated by one.
          </motion.span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.95, duration: 0.8 }}
          className="mt-8 max-w-[520px] text-[17px] leading-relaxed text-white/60"
        >
          Up to 50× perps that a single bad print can&apos;t liquidate, and prediction markets you can bet three ways. Execution on
          MagicBlock in about a second. Privacy by Arcium. Every outcome checked by Pyth <em>and</em> Switchboard.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.05, duration: 0.8 }}
          className="mt-10 flex flex-wrap items-center gap-3"
        >
          <Launch big label="Start trading" />
          <a
            href="#demo"
            onMouseEnter={() => play("hover")}
            onClick={() => play("click")}
            className="inline-flex h-14 items-center gap-3 rounded-full border border-white/12 bg-white/[0.03] px-6 text-[15px] text-white backdrop-blur transition hover:border-white/30"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-ink">
              <svg viewBox="0 0 10 10" className="ml-0.5 h-2.5 w-2.5" fill="currentColor">
                <path d="M1 0.5 9 5 1 9.5Z" />
              </svg>
            </span>
            Watch it work
          </a>
        </motion.div>

        <div className="mt-16 grid max-w-[720px] grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat k="SOL oracle" v={sol ? fmtUsd(sol.price) : "…"} d={0} />
          <Stat k="LP liquidity" v={liq ? `$${fmtCompact(liq / 1e6)}` : "…"} d={1} />
          <Stat k="Max leverage" v="50×" d={2} />
          <Stat k="Live markets" v={liveMarkets ? String(liveMarkets) : "…"} d={3} />
        </div>
      </motion.div>
    </section>
  );
}

/* ================================================================== demo video */

function DemoVideo() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const rotate = useTransform(scrollYProgress, [0, 1], [18, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.86, 1]);
  return (
    <section id="demo" className="relative mx-auto max-w-[1240px] scroll-mt-24 px-5 pt-10 pb-28 sm:px-8">
      <motion.div {...rise} className="mb-10 text-center">
        <p className="num text-[12px] tracking-[0.2em] text-flame-2 uppercase">The product, unedited</p>
        <h2 className="font-display mt-3 text-[clamp(40px,5vw,68px)] leading-[0.95] font-bold tracking-[-0.04em] text-white">
          One app. Perps, predictions, liquidity.
        </h2>
      </motion.div>
      <div ref={ref} style={{ perspective: 1400 }}>
        <motion.div style={{ rotateX: rotate, scale }} className="relative mx-auto origin-top">
          <div className="pointer-events-none absolute -inset-x-20 -top-20 -bottom-10 bg-[radial-gradient(ellipse_at_center,rgba(255,106,40,0.22),transparent_65%)] blur-2xl" />
          <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[#0c0c0e] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8)]">
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
              <span className="num mx-auto rounded-md bg-white/5 px-10 py-1 text-[11px] text-white/40">wick.app/perps</span>
            </div>
            <video
              src="/videos/demo.mp4"
              poster="/videos/demo-poster.jpg"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="block aspect-[16/10] w-full"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ================================================================== simulator */

function Simulator() {
  return (
    <section className="relative mx-auto max-w-[1240px] px-5 py-24 sm:px-8">
      <motion.div {...rise} className="mb-12 max-w-[760px]">
        <p className="num text-[12px] tracking-[0.2em] text-flame-2 uppercase">Try to liquidate yourself</p>
        <h2 className="font-display mt-3 text-[clamp(40px,5vw,68px)] leading-[0.95] font-bold tracking-[-0.04em] text-white">
          One bad print shouldn&apos;t cost you <span className="text-flame">everything</span>.
        </h2>
        <p className="mt-5 text-[17px] leading-relaxed text-white/55">
          Most liquidations happen on a single feed&apos;s flash wick. Drag Pyth down through your liquidation price and see what
          each kind of perp does.
        </p>
      </motion.div>
      <motion.div {...rise}>
        <WickSimulator />
      </motion.div>
    </section>
  );
}

/* ================================================================== bento */

function Tile({ className = "", children, i = 0 }: { className?: string; children: ReactNode; i?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <motion.div
      ref={ref}
      {...rise}
      transition={{ ...rise.transition, delay: i * 0.06 }}
      onMouseEnter={() => play("hover")}
      onMouseMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        ref.current!.style.setProperty("--mx", `${e.clientX - r.left}px`);
        ref.current!.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      className={`group relative overflow-hidden rounded-[26px] border border-white/[0.07] bg-[#0d0d10] p-7 ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100 [background:radial-gradient(380px_circle_at_var(--mx)_var(--my),rgba(255,122,26,0.12),transparent_60%)]" />
      <div className="relative h-full">{children}</div>
    </motion.div>
  );
}

function TileHead({ tag, title, body, color = "text-flame-2" }: { tag: string; title: string; body: string; color?: string }) {
  return (
    <div>
      <div className={`num text-[11px] tracking-[0.16em] uppercase ${color}`}>{tag}</div>
      <h3 className="font-display mt-3 text-[28px] leading-[1.02] font-bold tracking-[-0.03em] text-white">{title}</h3>
      <p className="mt-3 max-w-[380px] text-[14px] leading-relaxed text-white/50">{body}</p>
    </div>
  );
}

function MiniPerpChart() {
  const t = useLivePrice("SOL");
  const [pts, setPts] = useState<number[]>([]);
  useEffect(() => {
    if (t) setPts((p) => [...p.slice(-60), t.price]);
  }, [t]);
  const data = pts.length > 2 ? pts : [120, 120.3, 119.9, 120.6, 120.2, 120.9, 121.1];
  const lo = Math.min(...data) - 0.4;
  const hi = Math.max(...data) + 0.2;
  const d = data.map((v, i) => `${i ? "L" : "M"}${(i / (data.length - 1)) * 100} ${40 - ((v - lo) / (hi - lo)) * 36}`).join(" ");
  return (
    <svg viewBox="0 0 100 44" preserveAspectRatio="none" className="h-40 w-full">
      <defs>
        <linearGradient id="perpfill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ff7a1a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ff7a1a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L100 44 L0 44 Z`} fill="url(#perpfill)" />
      <path d={d} fill="none" stroke="#ff7a1a" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
      <line x1="0" x2="100" y1="41" y2="41" stroke="#ff2e63" strokeDasharray="1.5 1.5" strokeWidth="0.4" />
    </svg>
  );
}

function ProbBar() {
  const [p, setP] = useState(58);
  useEffect(() => {
    const id = setInterval(() => setP((v) => Math.max(18, Math.min(86, v + (Math.random() - 0.48) * 9))), 1300);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="mt-8">
      <div className="flex items-end justify-between">
        <span className="num text-[44px] leading-none text-white">{p.toFixed(0)}%</span>
        <span className="text-[12px] text-white/40">chance YES</span>
      </div>
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-no/25">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-[#5ee0a1] to-[#9ff5c8]" animate={{ width: `${p}%` }} transition={{ type: "spring", stiffness: 70, damping: 14 }} />
      </div>
      <div className="mt-3 flex gap-2 text-[11px]">
        {["Instant", "Touch", "Sealed", "Limit"].map((x) => (
          <span key={x} className="rounded-full border border-white/10 px-2.5 py-1 text-white/50">
            {x}
          </span>
        ))}
      </div>
    </div>
  );
}

function Cipher() {
  const [s, setS] = useState("");
  useEffect(() => {
    const id = setInterval(() => setS(Array.from({ length: 96 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")), 120);
    return () => clearInterval(id);
  }, []);
  return <div className="num mt-6 text-[11px] leading-relaxed break-all text-[#b79cff]/60">{s}</div>;
}

function SpeedRing() {
  return (
    <div className="relative mt-6 grid h-28 place-items-center">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute h-20 w-20 rounded-full border border-[#8ab4ff]/40"
          animate={{ scale: [1, 2.2], opacity: [0.7, 0] }}
          transition={{ repeat: Infinity, duration: 2.4, delay: i * 0.8 }}
        />
      ))}
      <span className="num relative text-[40px] text-white">~1s</span>
    </div>
  );
}

function Bento() {
  const perps = usePoll(() => fetchPerps(), 20_000, []);
  const liq = perps.data?.pool?.data.liquidity.toNumber();
  return (
    <section className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8">
      <motion.div {...rise} className="mb-12">
        <p className="num text-[12px] tracking-[0.2em] text-flame-2 uppercase">Everything in one place</p>
        <h2 className="font-display mt-3 max-w-[820px] text-[clamp(40px,5vw,68px)] leading-[0.95] font-bold tracking-[-0.04em] text-white">
          Built like an exchange. <span className="text-white/35">Settled like a court.</span>
        </h2>
      </motion.div>
      <div className="grid auto-rows-[minmax(260px,auto)] gap-4 md:grid-cols-6">
        <Tile className="md:col-span-4" i={0}>
          <div className="flex h-full flex-col justify-between">
            <TileHead
              tag="Perpetuals"
              title="50× on SOL, BTC & ETH."
              body="Market, limit, take-profit and stop-loss orders. Partial closes, margin adjustments, and one-click insurance at your liquidation price."
            />
            <MiniPerpChart />
          </div>
        </Tile>
        <Tile className="md:col-span-2" i={1}>
          <TileHead tag="Speed" title="Fills in a second." body="MagicBlock rollup. Zero gas. One signature per day." color="text-ice" />
          <SpeedRing />
        </Tile>
        <Tile className="md:col-span-3" i={2}>
          <TileHead tag="Predictions" title="Call it three ways." body="Trade YES/NO, bet on the path with touch tickets, or go sealed. Limit orders included." color="text-yes" />
          <ProbBar />
        </Tile>
        <Tile className="md:col-span-3" i={3}>
          <TileHead
            tag="Privacy"
            title="Stops nobody can hunt."
            body="Arcium MPC checks encrypted stop-losses and matches sealed orders. Only yes/no and batch totals are revealed."
            color="text-violet"
          />
          <Cipher />
        </Tile>
        <Tile className="md:col-span-2" i={4}>
          <TileHead tag="Liquidity" title="Be the house." body="LPs earn fees, borrow and trader losses. Profit is reserved up front." />
          <div className="num mt-6 text-[44px] leading-none text-white">{liq ? `$${fmtCompact(liq / 1e6)}` : "…"}</div>
          <div className="mt-2 text-[12px] text-white/40">in the perp pool right now</div>
        </Tile>
        <Tile className="md:col-span-4" i={5}>
          <div className="grid h-full gap-6 sm:grid-cols-2">
            <TileHead
              tag="Two oracles"
              title="Agree, or nothing moves."
              body="Every liquidation, settlement and touch payout needs a Wormhole-verified Pyth price and an Ed25519-verified Switchboard quote to agree."
            />
            <div className="flex items-center justify-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logos/pyth.png" alt="Pyth" className="h-16 w-16 rounded-2xl" />
              <motion.span
                className="h-px w-16 bg-gradient-to-r from-[#b79cff] via-[#ff7a1a] to-[#ff4f8b]"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 1.8 }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logos/switchboard.png" alt="Switchboard" className="h-16 w-16 rounded-2xl" />
            </div>
          </div>
        </Tile>
      </div>
    </section>
  );
}

/* ================================================================== architecture */

function HowItWorks() {
  return (
    <section id="architecture" className="mx-auto max-w-[1240px] scroll-mt-24 px-5 py-24 sm:px-8">
      <motion.div {...rise} className="mb-10 max-w-[760px]">
        <p className="num text-[12px] tracking-[0.2em] text-flame-2 uppercase">Under the hood</p>
        <h2 className="font-display mt-3 text-[clamp(40px,5vw,68px)] leading-[0.95] font-bold tracking-[-0.04em] text-white">
          Follow a trade through the system.
        </h2>
      </motion.div>
      <motion.div {...rise}>
        <Architecture />
      </motion.div>
    </section>
  );
}

/* ================================================================== live markets */

function LiveMarkets() {
  const { data } = useMarkets();
  const live = (data ?? []).filter((r) => "open" in (r.m.data.status as object) && r.m.data.expiry.toNumber() > Date.now() / 1000).slice(0, 4);
  return (
    <section className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8">
      <motion.div {...rise} className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-display text-[clamp(36px,4vw,56px)] leading-none font-bold tracking-[-0.04em] text-white">Live right now</h2>
        <Link href="/predictions" onMouseEnter={() => play("hover")} className="text-[14px] text-white/50 hover:text-white">
          All prediction markets →
        </Link>
      </motion.div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {live.map((r, i) => {
          const q = marketQuestion(r.m.data);
          const yes = yesBps(r.m.data.yesReserve.toNumber(), r.m.data.noReserve.toNumber());
          return (
            <motion.div key={r.key.toBase58()} {...rise} transition={{ ...rise.transition, delay: i * 0.06 }}>
              <Link
                href={`/predictions/${r.key.toBase58()}`}
                onMouseEnter={() => play("hover")}
                className="block rounded-[22px] border border-white/[0.07] bg-[#0d0d10] p-5 transition hover:-translate-y-1 hover:border-white/15"
              >
                <div className="flex items-center gap-2 text-[14px] font-semibold text-white">
                  <span className="h-2 w-2 rounded-full" style={{ background: q.asset?.color }} />
                  {q.text}?
                  <span className="num ml-auto text-[11px] font-normal text-white/40">{countdown(r.m.data.expiry.toNumber() - Date.now() / 1000)}</span>
                </div>
                <div className="mt-5 flex items-end justify-between">
                  <span className="num text-[36px] leading-none text-white">{(yes / 100).toFixed(0)}%</span>
                  <span className="text-[11px] text-white/40">chance YES</span>
                </div>
                <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-no/25">
                  <div className="h-full bg-yes" style={{ width: `${yes / 100}%` }} />
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

/* ================================================================== logos + final */

const STACK = [
  { name: "Solana", src: "/logos/solana-icon.svg", raw: true },
  { name: "MagicBlock", src: "/logos/magicblock.png" },
  { name: "Arcium", src: "/logos/arcium.png" },
  { name: "Pyth", src: "/logos/pyth.png" },
  { name: "Switchboard", src: "/logos/switchboard.png" },
];

function LogoMarquee() {
  const row = STACK.map((x) => (
    <span key={x.name} className="flex shrink-0 items-center gap-3 px-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={x.src} alt="" className={x.raw ? "h-7 w-8 object-contain" : "h-9 w-9 rounded-xl"} />
      <span className="font-display text-[28px] font-semibold tracking-[-0.03em] text-white/50">{x.name}</span>
    </span>
  ));
  return (
    <section className="border-y border-white/5 py-10">
      <p className="mb-6 text-center text-[11px] tracking-[0.25em] text-white/30 uppercase">Built on</p>
      <div className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
        <div className="flex w-max animate-[marquee_30s_linear_infinite]">
          {row}
          {row}
          {row}
          {row}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden px-5 py-40 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,106,40,0.2),transparent_60%)]" />
      <motion.div {...rise} className="relative flex flex-col items-center">
        <motion.div animate={{ scale: [1, 1.04, 1] }} transition={{ repeat: Infinity, duration: 3 }}>
          <Logo size={96} glow />
        </motion.div>
        <h2 className="font-display mt-10 max-w-[900px] text-[clamp(48px,7vw,104px)] leading-[0.9] font-extrabold tracking-[-0.05em] text-white">
          The market never sleeps.{" "}
          <span className="bg-gradient-to-br from-[#ffd08a] via-[#ff7a1a] to-[#ff2e63] bg-clip-text text-transparent">Neither do wicks.</span>
        </h2>
        <div className="mt-12">
          <Launch big label="Launch Wick" />
        </div>
        <p className="mt-5 text-[12px] text-white/35">Solana devnet · free test USDC inside · one-click trading</p>
      </motion.div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-6 px-5 py-10 text-[13px] text-white/45 sm:px-8">
        <Wordmark size={20} />
        <span>Wick-proof perps and prediction markets on Solana.</span>
        <span className="ml-auto flex gap-6">
          {[
            ["Perps", "/perps"],
            ["Predictions", "/predictions"],
            ["Liquidity", "/liquidity"],
            ["Portfolio", "/portfolio"],
            ["Docs", "/docs"],
          ].map(([l, h]) => (
            <Link key={h} href={h} className="hover:text-white">
              {l}
            </Link>
          ))}
        </span>
      </div>
    </footer>
  );
}
