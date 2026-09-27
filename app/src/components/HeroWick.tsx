"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Candle, fetchCandles } from "@/lib/prices";

const W = 460;
const H = 300;
const N = 36;

/** Real SOL candles with a touch level; the first wick through it catches fire. */
export function HeroWick() {
  const [cs, setCs] = useState<Candle[]>([]);
  useEffect(() => {
    fetchCandles("SOL").then((all) => setCs(all.slice(-N)));
  }, []);
  if (cs.length < 10) return <div style={{ width: W, height: H }} />;

  const hi = Math.max(...cs.map((c) => c.high));
  const lo = Math.min(...cs.map((c) => c.low));
  const pad = (hi - lo) * 0.18 || 1;
  const y = (p: number) => H - 24 - ((p - (lo - pad)) / (hi + pad - (lo - pad))) * (H - 48);
  const step = W / cs.length;
  // Level sits just under the session high so exactly one wick pierces it.
  const level = hi - (hi - lo) * 0.06;
  const hitIdx = cs.findIndex((c) => c.high >= level);
  const hit = cs[hitIdx];

  return (
    <div className="relative" style={{ width: W, height: H }}>
      <svg width={W} height={H} className="overflow-visible">
        <defs>
          <radialGradient id="glow">
            <stop offset="0%" stopColor="#ff7a1a" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ff7a1a" stopOpacity="0" />
          </radialGradient>
        </defs>
        {cs.map((c, i) => {
          const up = c.close >= c.open;
          const x = i * step + step / 2;
          const color = i === hitIdx ? "#ff7a1a" : up ? "#5ee0a1" : "#ff6b81";
          return (
            <motion.g
              key={c.time}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: i === hitIdx ? 1 : 0.8, y: 0 }}
              transition={{ delay: 0.3 + i * 0.025 }}
            >
              <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth={1.2} />
              <rect
                x={x - step * 0.3}
                width={step * 0.6}
                y={y(Math.max(c.open, c.close))}
                height={Math.max(1.5, Math.abs(y(c.open) - y(c.close)))}
                rx={1}
                fill={color}
              />
            </motion.g>
          );
        })}
        <motion.line
          x1={0}
          x2={W}
          y1={y(level)}
          y2={y(level)}
          stroke="#ff7a1a"
          strokeDasharray="4 5"
          strokeWidth={1}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.2, duration: 1.1 }}
        />
        {hit && (
          <motion.g initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.4 }}>
            <circle cx={hitIdx * step + step / 2} cy={y(level)} r={26} fill="url(#glow)" />
            <path
              className="flicker"
              transform={`translate(${hitIdx * step + step / 2 - 7} ${y(hit.high) - 22}) scale(1.2)`}
              d="M6 0c2.1 2.6 2.9 4.5 1.6 6.5C7 7.4 6 7.8 6 7.8s-1-.4-1.6-1.3C3.1 4.5 3.9 2.6 6 0Z"
              fill="#ff7a1a"
            />
          </motion.g>
        )}
      </svg>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.6 }}
        className="panel absolute right-0 bottom-2 bg-ink-2/90 px-3.5 py-2.5 backdrop-blur"
      >
        <div className="text-[10px] tracking-wide text-muted uppercase">Touch ↑ ${level.toFixed(2)}</div>
        <div className="num text-[15px] text-flame">hit · paid on both oracles</div>
      </motion.div>
      <div className="num absolute top-0 left-0 text-[10px] text-faint">SOL/USD · last {cs.length}m</div>
    </div>
  );
}
