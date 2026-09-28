"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { play } from "@/lib/sound";

const W = 760;
const H = 320;
const N = 64;
const SPIKE_AT = 44;
const ENTRY = 120;
const LIQ = 114.6; // 20× long

function path(seed: number) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
  const out: number[] = [];
  let v = ENTRY;
  for (let i = 0; i < N; i++) {
    v += r() * 0.9 + (i > 30 ? -0.06 : 0.02);
    out.push(v);
  }
  return out;
}

/**
 * Drag a flash crash on one oracle and watch Wick refuse to liquidate unless both agree.
 */
export function WickSimulator() {
  const base = useMemo(() => path(11), []);
  const [depth, setDepth] = useState(0); // 0..1: how far the Pyth wick is pulled down
  const [sbAgrees, setSbAgrees] = useState(false);
  const dragging = useRef(false);
  const svg = useRef<SVGSVGElement>(null);
  const lastState = useRef<"safe" | "blocked" | "liq">("safe");

  const min = 106;
  const max = 126;
  const y = (v: number) => 20 + ((max - v) / (max - min)) * (H - 50);
  const x = (i: number) => 30 + (i / (N - 1)) * (W - 120);

  const spike = base[SPIKE_AT] - depth * 11;
  const pyth = base.map((v, i) => (i === SPIKE_AT ? spike : v));
  const sb = base.map((v, i) => (i === SPIKE_AT && sbAgrees ? spike + 0.25 : v + Math.sin(i) * 0.08));
  const pythUnder = spike < LIQ;
  const sbUnder = sb[SPIKE_AT] < LIQ;
  const state: "safe" | "blocked" | "liq" = pythUnder && sbUnder ? "liq" : pythUnder || sbUnder ? "blocked" : "safe";

  useEffect(() => {
    if (state !== lastState.current) {
      if (state === "blocked") play("shield");
      if (state === "liq") play("thud");
      lastState.current = state;
    }
  }, [state]);

  const line = (vs: number[]) => vs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current || !svg.current) return;
    const r = svg.current.getBoundingClientRect();
    const py = ((e.clientY - r.top) / r.height) * H;
    const d = Math.min(1, Math.max(0, (py - y(base[SPIKE_AT])) / (y(base[SPIKE_AT] - 11) - y(base[SPIKE_AT]))));
    if (Math.abs(d - depth) > 0.04) play("tick");
    setDepth(d);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <div className="panel relative overflow-hidden p-4">
        <div className="mb-2 flex flex-wrap items-center gap-4 px-2 text-[12px]">
          <span className="flex items-center gap-2">
            <span className="h-0.5 w-5 rounded bg-[#b79cff]" /> Pyth
          </span>
          <span className="flex items-center gap-2">
            <span className="h-0.5 w-5 rounded bg-[#ff4f8b]" /> Switchboard
          </span>
          <span className="flex items-center gap-2 text-flame-2">
            <span className="h-0 w-5 border-t border-dashed border-flame" /> your liquidation · 20× long
          </span>
        </div>
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none select-none"
          onPointerMove={onMove}
          onPointerUp={() => (dragging.current = false)}
          onPointerLeave={() => (dragging.current = false)}
        >
          <line x1="30" x2={W - 90} y1={y(LIQ)} y2={y(LIQ)} stroke="#ff7a1a" strokeDasharray="6 6" />
          <text x={W - 84} y={y(LIQ) + 4} fill="#ffb266" fontSize="12" fontFamily="var(--font-jetbrains-mono)">
            ${LIQ}
          </text>
          <line x1="30" x2={W - 90} y1={y(ENTRY)} y2={y(ENTRY)} stroke="#2a2a30" />
          <text x={W - 84} y={y(ENTRY) + 4} fill="#5b5955" fontSize="12" fontFamily="var(--font-jetbrains-mono)">
            entry
          </text>
          <path d={line(sb)} fill="none" stroke="#ff4f8b" strokeWidth="2" opacity="0.9" />
          <path d={line(pyth)} fill="none" stroke="#b79cff" strokeWidth="2.2" />
          {/* drag handle */}
          <g
            style={{ cursor: "grab" }}
            onPointerDown={(e) => {
              dragging.current = true;
              (e.target as Element).setPointerCapture?.(e.pointerId);
              play("click");
            }}
          >
            <circle cx={x(SPIKE_AT)} cy={y(spike)} r="16" fill="rgba(183,156,255,0.15)" />
            <circle cx={x(SPIKE_AT)} cy={y(spike)} r="7" fill="#b79cff" stroke="#0a0a0b" strokeWidth="2" />
            {depth < 0.05 && (
              <motion.text
                x={x(SPIKE_AT) + 16}
                y={y(spike) + 30}
                fill="#f3efe6"
                fontSize="12"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ repeat: Infinity, duration: 1.6 }}
              >
                ↓ drag to crash Pyth
              </motion.text>
            )}
          </g>
          {state !== "safe" && (
            <motion.circle
              key={state}
              cx={x(SPIKE_AT)}
              cy={y(LIQ)}
              r="10"
              fill="none"
              stroke={state === "liq" ? "#ff6b81" : "#5ee0a1"}
              initial={{ r: 6, opacity: 1 }}
              animate={{ r: 60, opacity: 0 }}
              transition={{ duration: 0.9 }}
            />
          )}
        </svg>
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={() => {
            setSbAgrees(!sbAgrees);
            play("toggle");
          }}
          className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${sbAgrees ? "border-[#ff4f8b]/50 bg-[#ff4f8b]/5" : "hairline"}`}
        >
          <span>
            <span className="block text-[14px] font-semibold">Switchboard sees it too</span>
            <span className="text-[12px] text-muted">Make the crash real on both independent feeds</span>
          </span>
          <span className={`h-5 w-9 rounded-full p-0.5 transition ${sbAgrees ? "bg-[#ff4f8b]" : "bg-line-2"}`}>
            <span className={`block h-4 w-4 rounded-full bg-ink transition ${sbAgrees ? "translate-x-4" : ""}`} />
          </span>
        </button>

        <div className="grid grid-cols-2 gap-3">
          <Verdict title="Single-oracle perp" bad={pythUnder} text={pythUnder ? "Liquidated on one print" : "Open"} />
          <Verdict title="Wick" bad={state === "liq"} text={state === "liq" ? "Liquidated: both agree" : state === "blocked" ? "Safe: oracles disagree" : "Open"} highlight />
        </div>

        <AnimatePresence mode="wait">
          <motion.p
            key={state}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="rounded-2xl bg-ink-2 p-4 text-[13px] leading-relaxed text-muted"
          >
            {state === "safe" && "Price is above your liquidation level on both feeds. Nothing to do."}
            {state === "blocked" &&
              `Pyth printed $${spike.toFixed(2)}, under your $${LIQ} liquidation, but Switchboard stayed at $${sb[SPIKE_AT].toFixed(2)}. On Wick a single-feed wick can't close your position.`}
            {state === "liq" &&
              "Both independent oracles confirm the move, so it's a real move and the position is liquidated. Whatever equity is left above the fee goes back to you."}
          </motion.p>
        </AnimatePresence>
        <button
          onClick={() => {
            setDepth(0);
            setSbAgrees(false);
          }}
          className="self-start text-[12px] text-faint hover:text-muted"
        >
          reset
        </button>
      </div>
    </div>
  );
}

function Verdict({ title, bad, text, highlight }: { title: string; bad: boolean; text: string; highlight?: boolean }) {
  return (
    <motion.div
      layout
      className={`rounded-2xl border p-4 ${highlight ? "border-flame/30 bg-flame/[0.04]" : "hairline"}`}
      animate={{ scale: bad ? [1, 1.03, 1] : 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="text-[11px] tracking-wide text-muted uppercase">{title}</div>
      <div className={`mt-2 text-[15px] font-semibold ${bad ? "text-no" : "text-yes"}`}>{bad ? "✕" : "✓"} {text}</div>
    </motion.div>
  );
}
