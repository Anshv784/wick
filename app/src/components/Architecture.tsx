"use client";

import { AnimatePresence, motion } from "motion/react";
import { ReactNode, useState } from "react";

/* ------------------------------------------------------------------ glyphs */

const Glyph = {
  trader: (
    <g>
      {[10, 22, 34, 46, 58, 70].map((x, i) => {
        const h = [18, 26, 14, 30, 22, 34][i];
        const up = i % 2 === 0;
        return (
          <g key={x}>
            <line x1={x} x2={x} y1={40 - h / 2 - 6} y2={40 + h / 2 + 4} stroke={up ? "#5ee0a1" : "#ff6b81"} strokeWidth="1.5" />
            <rect x={x - 3.5} y={40 - h / 2} width="7" height={h} rx="1.5" fill={up ? "#5ee0a1" : "#ff6b81"} />
          </g>
        );
      })}
    </g>
  ),
  rollup: (
    <g fill="none" stroke="#9b87ff" strokeWidth="1.6">
      {[0, 9, 18].map((dy) => (
        <path key={dy} d={`M40 ${14 + dy} L70 ${27 + dy} L40 ${40 + dy} L10 ${27 + dy} Z`} fill={dy === 0 ? "rgba(155,135,255,0.12)" : "none"} />
      ))}
    </g>
  ),
  solana: (
    <g>
      <defs>
        <linearGradient id="solg" x1="0" x2="1">
          <stop offset="0" stopColor="#5ee0a1" />
          <stop offset="1" stopColor="#b79cff" />
        </linearGradient>
      </defs>
      {[16, 34, 52].map((y, i) => (
        <path key={y} d={i === 1 ? `M14 ${y} H58 L66 ${y + 9} H22 Z` : `M22 ${y} H66 L58 ${y + 9} H14 Z`} fill="url(#solg)" />
      ))}
    </g>
  ),
  oracle: (
    <g fill="none" stroke="#f3efe6" strokeWidth="1.6">
      <circle cx="40" cy="40" r="20" />
      <circle cx="40" cy="40" r="11" stroke="#ffb266" />
      <circle cx="40" cy="40" r="3" fill="#ffb266" stroke="none" />
    </g>
  ),
  arcium: (
    <g fill="none" stroke="#b79cff" strokeWidth="1.6">
      <rect x="22" y="34" width="36" height="28" rx="5" fill="rgba(183,156,255,0.12)" />
      <path d="M30 34 V26 a10 10 0 0 1 20 0 V34" />
      <circle cx="40" cy="47" r="3.5" fill="#b79cff" stroke="none" />
      <line x1="40" x2="40" y1="50" y2="56" />
    </g>
  ),
  keeper: (
    <g fill="none" stroke="#8ab4ff" strokeWidth="1.6">
      <rect x="20" y="26" width="40" height="30" rx="8" />
      <circle cx="32" cy="41" r="3" fill="#8ab4ff" />
      <circle cx="48" cy="41" r="3" fill="#8ab4ff" />
      <line x1="40" x2="40" y1="18" y2="26" />
      <circle cx="40" cy="16" r="2.5" fill="#8ab4ff" />
    </g>
  ),
  vault: (
    <g fill="none" stroke="#5ee0a1" strokeWidth="1.6">
      <rect x="18" y="22" width="44" height="36" rx="6" fill="rgba(94,224,161,0.08)" />
      <circle cx="40" cy="40" r="9" />
      <path d="M40 31 V36 M40 44 V49 M31 40 H36 M44 40 H49" />
    </g>
  ),
  verdict: (
    <g fill="none" strokeWidth="1.8">
      <circle cx="40" cy="40" r="20" stroke="#ff7a1a" fill="rgba(255,122,26,0.1)" />
      <path d="M31 40 L37 46 L50 33" stroke="#ff7a1a" />
    </g>
  ),
};

/* ------------------------------------------------------------------ graph */

type NodeId = "trader" | "rollup" | "oracles" | "solana" | "keeper" | "arcium" | "vault" | "verdict";

const NODES: Record<NodeId, { x: number; y: number; w: number; h: number; title: string; sub: string; glyph: ReactNode; about: string }> = {
  trader: { x: 30, y: 150, w: 190, h: 190, title: "Trader", sub: "app · one-click session", glyph: Glyph.trader, about: "Your wallet signs once to deposit and authorise a 24h session key. After that the browser key signs every rollup trade: no popups, no simulation warnings." },
  rollup: { x: 330, y: 150, w: 210, h: 190, title: "MagicBlock ER", sub: "~1s · gasless", glyph: Glyph.rollup, about: "Perp positions, the LP pool, prediction pools and order books are delegated to an ephemeral rollup. Opens, closes, limit fills and liquidations confirm in about a second." },
  oracles: { x: 470, y: 410, w: 220, h: 110, title: "Oracles", sub: "Pyth + Switchboard", glyph: Glyph.oracle, about: "Pyth (Wormhole-verified push feed) and Switchboard (Ed25519-verified quote from Coinbase, Kraken, Bitstamp). The rollup reads live clones of both accounts." },
  solana: { x: 650, y: 150, w: 190, h: 190, title: "Solana", sub: "vaults · settlement", glyph: Glyph.solana, about: "USDC only moves here. Rollup state is committed back to Solana; markets settle, touch tickets pay and sealed batches live on base." },
  keeper: { x: 730, y: 410, w: 200, h: 110, title: "Keeper", sub: "permissionless", glyph: Glyph.keeper, about: "Pushes oracle prices, liquidates, fills limit/TP/SL orders, confirms touches, settles markets and runs Arcium jobs. Anyone could run it; nothing it does needs trust." },
  verdict: { x: 945, y: 40, w: 235, h: 120, title: "Dual-oracle verdict", sub: "agree or freeze", glyph: Glyph.verdict, about: "Liquidations, settlements and touch payouts all require both oracles on the same side and within the max gap. If they disagree, nothing pays the wrong side." },
  arcium: { x: 945, y: 185, w: 235, h: 120, title: "Arcium MPC", sub: "sealed · stops", glyph: Glyph.arcium, about: "Encrypted order sizes and sides, and encrypted stop-loss prices, are computed on inside MPC. Only batch totals and 'stop crossed: yes/no' are ever revealed." },
  vault: { x: 945, y: 330, w: 235, h: 120, title: "USDC vaults", sub: "claims · payouts", glyph: Glyph.vault, about: "Perp credit, prediction pools, touch-ticket house funds and sealed escrow. Every payout leaves from a program-owned vault." },
};

type EdgeId = "t-r" | "r-s" | "o-r" | "o-s" | "k-r" | "k-s" | "s-v" | "s-a" | "s-x" | "t-s";

const c = (n: NodeId, side: "l" | "r" | "t" | "b") => {
  const { x, y, w, h } = NODES[n];
  return side === "l" ? [x, y + h / 2] : side === "r" ? [x + w, y + h / 2] : side === "t" ? [x + w / 2, y] : [x + w / 2, y + h];
};
const line = (a: number[], b: number[]) => `M${a[0]} ${a[1]} L${b[0]} ${b[1]}`;
const curve = (a: number[], b: number[]) => {
  const mx = (a[0] + b[0]) / 2;
  return `M${a[0]} ${a[1]} C${mx} ${a[1]} ${mx} ${b[1]} ${b[0]} ${b[1]}`;
};

const EDGES: Record<EdgeId, { d: string; label?: string; dashed?: boolean }> = {
  "t-r": { d: line(c("trader", "r"), c("rollup", "l")), label: "trade" },
  "t-s": { d: `M125 150 C125 60 745 60 745 150`, label: "deposit · encrypted order", dashed: true },
  "r-s": { d: line(c("rollup", "r"), c("solana", "l")), label: "commit" },
  "o-r": { d: `M530 410 C530 375 470 375 470 342`, dashed: true },
  "o-s": { d: `M630 410 C630 375 700 375 700 342`, dashed: true },
  "k-r": { d: `M730 500 C600 585 390 585 390 342`, dashed: true },
  "k-s": { d: `M815 410 L815 342`, dashed: true },
  "s-x": { d: curve(c("solana", "r"), c("verdict", "l")) },
  "s-a": { d: curve(c("solana", "r"), c("arcium", "l")) },
  "s-v": { d: curve(c("solana", "r"), c("vault", "l")) },
};

/* ------------------------------------------------------------------ flows */

type Flow = { id: string; name: string; edges: EdgeId[]; nodes: NodeId[]; steps: string[] };

const FLOWS: Flow[] = [
  {
    id: "perp",
    name: "Perp trade",
    edges: ["t-s", "t-r", "o-r", "r-s", "s-v"],
    nodes: ["trader", "solana", "rollup", "oracles", "vault"],
    steps: [
      "Deposit USDC on Solana and authorise a 24h session key (one wallet signature)",
      "Open 20× long on the rollup, priced off the live Pyth clone, in ~1s",
      "Optional: liquidation insurance (a touch ticket) and TP/SL or hidden stops",
      "Close, partially close or re-margin; credit settles to the vault on withdrawal",
    ],
  },
  {
    id: "liq",
    name: "Wick-proof liquidation",
    edges: ["o-r", "k-r", "r-s", "s-x"],
    nodes: ["oracles", "keeper", "rollup", "verdict"],
    steps: [
      "Keeper simulates liquidate_perp for every open position each tick",
      "Program reads BOTH oracle clones: fresh, and within the max gap",
      "Only if equity is under maintenance at both prices does it liquidate",
      "A single-feed wick does nothing; the trader keeps equity above the fee",
    ],
  },
  {
    id: "predict",
    name: "Prediction market",
    edges: ["t-r", "r-s", "k-s", "o-s", "s-x", "s-v"],
    nodes: ["trader", "rollup", "solana", "keeper", "oracles", "verdict", "vault"],
    steps: [
      "Buy YES/NO (market or limit) on the rollup; touch tickets on Solana",
      "At expiry the keeper commits the market and positions back to Solana",
      "settle_market needs Pyth and Switchboard within 5 min, same side, close together",
      "Agree → settled, claim 1.00 per winning share · disagree → freeze, void at 0.50",
    ],
  },
  {
    id: "private",
    name: "Sealed & hidden stops",
    edges: ["t-s", "s-a", "k-s", "o-s", "r-s"],
    nodes: ["trader", "solana", "arcium", "keeper", "oracles", "rollup"],
    steps: [
      "Side, size or stop price is encrypted in the browser to the Arcium MXE key",
      "Sealed batches reveal only YES/NO totals; every order fills at one price",
      "Keeper asks Arcium 'has the Pyth mark crossed this stop?' → yes / no only",
      "On yes, the position closes on the rollup; the stop level never goes on-chain",
    ],
  },
];

/* ------------------------------------------------------------------ component */

export function Architecture() {
  const [flowId, setFlowId] = useState(FLOWS[0].id);
  const [hover, setHover] = useState<NodeId | null>(null);
  const flow = FLOWS.find((f) => f.id === flowId)!;
  const activeEdge = (e: EdgeId) => flow.edges.includes(e);
  const activeNode = (n: NodeId) => flow.nodes.includes(n);

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap gap-1 border-b hairline p-2">
        {FLOWS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFlowId(f.id)}
            className={`relative rounded-lg px-3.5 py-2 text-[13px] transition ${f.id === flowId ? "text-paper" : "text-muted hover:text-paper"}`}
          >
            {f.id === flowId && <motion.span layoutId="arch-tab" className="absolute inset-0 rounded-lg bg-ink-3" />}
            <span className="relative">{f.name}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <svg viewBox="0 0 1200 600" className="block min-w-[860px]">
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M1 1 L9 5 L1 9" fill="none" stroke="#9b87ff" strokeWidth="1.6" />
            </marker>
            <marker id="arr-dim" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M1 1 L9 5 L1 9" fill="none" stroke="#323238" strokeWidth="1.6" />
            </marker>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {(Object.keys(EDGES) as EdgeId[]).map((id) => {
            const e = EDGES[id];
            const on = activeEdge(id);
            return (
              <g key={id}>
                <path
                  id={`edge-${id}`}
                  d={e.d}
                  fill="none"
                  stroke={on ? "#9b87ff" : "#26262b"}
                  strokeWidth={on ? 1.8 : 1.2}
                  strokeDasharray={e.dashed ? "5 6" : undefined}
                  markerEnd={`url(#${on ? "arr" : "arr-dim"})`}
                  style={{ transition: "stroke .4s" }}
                />
                {on && (
                  <circle r="4.5" fill="#c8bcff" filter="url(#glow)">
                    <animateMotion dur={e.dashed ? "2.6s" : "1.8s"} repeatCount="indefinite" rotate="auto">
                      <mpath href={`#edge-${id}`} />
                    </animateMotion>
                  </circle>
                )}
              </g>
            );
          })}

          {/* transaction badges on the main rail, like packets in flight */}
          {[
            { x: 275, y: 245, on: activeEdge("t-r"), label: "tx" },
            { x: 595, y: 245, on: activeEdge("r-s"), label: "commit" },
          ].map((b) => (
            <g key={b.x} opacity={b.on ? 1 : 0.35} style={{ transition: "opacity .4s" }}>
              <circle cx={b.x} cy={b.y} r="22" fill="#111113" stroke="#9b87ff" strokeWidth="1.4" />
              <path
                d={`M${b.x - 6} ${b.y - 9} h9 l4 4 v14 h-13 z M${b.x - 3} ${b.y - 1} h7 M${b.x - 3} ${b.y + 3} h7`}
                fill="none"
                stroke="#c8bcff"
                strokeWidth="1.3"
              />
              <text x={b.x} y={b.y + 40} textAnchor="middle" fill="#8d8a83" fontSize="11" fontFamily="var(--font-jetbrains-mono)">
                {b.label}
              </text>
            </g>
          ))}

          {(Object.keys(NODES) as NodeId[]).map((id) => {
            const n = NODES[id];
            const on = activeNode(id);
            const big = n.h >= 180;
            return (
              <g
                key={id}
                onMouseEnter={() => setHover(id)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "default", opacity: on ? 1 : 0.4, transition: "opacity .4s" }}
              >
                <rect
                  x={n.x}
                  y={n.y}
                  width={n.w}
                  height={n.h}
                  rx="18"
                  fill="#131316"
                  stroke={hover === id ? "#9b87ff" : on ? "#3a3548" : "#242428"}
                  strokeWidth={hover === id ? 1.6 : 1.2}
                />
                <g transform={big ? `translate(${n.x + n.w / 2 - 40} ${n.y + 26})` : `translate(${n.x + 14} ${n.y + n.h / 2 - 32}) scale(0.8)`}>
                  {big && <circle cx="40" cy="40" r="38" fill="#0b0b0d" stroke="#242428" />}
                  {n.glyph}
                </g>
                <text
                  x={big ? n.x + n.w / 2 : n.x + 88}
                  y={big ? n.y + n.h - 42 : n.y + n.h / 2 - 4}
                  textAnchor={big ? "middle" : "start"}
                  fill="#f3efe6"
                  fontSize="15"
                  fontWeight="600"
                  fontFamily="var(--font-inter-tight)"
                >
                  {n.title}
                </text>
                <text
                  x={big ? n.x + n.w / 2 : n.x + 88}
                  y={big ? n.y + n.h - 22 : n.y + n.h / 2 + 16}
                  textAnchor={big ? "middle" : "start"}
                  fill="#8d8a83"
                  fontSize="11.5"
                  fontFamily="var(--font-jetbrains-mono)"
                >
                  {n.sub}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid gap-px border-t hairline bg-line md:grid-cols-[1.4fr_1fr]">
        <div className="bg-ink p-5">
          <AnimatePresence mode="wait">
            <motion.ol
              key={flow.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="space-y-2.5"
            >
              {flow.steps.map((s, i) => (
                <li key={s} className="flex gap-3 text-[13px] leading-relaxed text-muted">
                  <span className="num mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[#9b87ff]/50 text-[10px] text-[#c8bcff]">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </motion.ol>
          </AnimatePresence>
        </div>
        <div className="bg-ink p-5">
          <AnimatePresence mode="wait">
            <motion.div key={hover ?? "hint"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {hover ? (
                <>
                  <div className="text-[14px] font-semibold">{NODES[hover].title}</div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{NODES[hover].about}</p>
                </>
              ) : (
                <p className="text-[13px] leading-relaxed text-faint">
                  Pick a flow above to trace it through the system. Hover any box for what it does.
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
