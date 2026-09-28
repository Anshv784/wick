"use client";

import {
  AreaSeries,
  CandlestickSeries,
  createChart,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  LineSeries,
  LineStyle,
  MouseEventParams,
  SeriesType,
  UTCTimestamp,
} from "lightweight-charts";
import { motion } from "motion/react";
import { ReactNode, useEffect, useRef, useState } from "react";
import type { AssetSymbol } from "@/lib/assets";
import { fmtUsd } from "@/lib/format";
import { Candle, fetchCandles, useLivePrice } from "@/lib/prices";

export type ChartLine = { price: number; color: string; title: string; dashed?: boolean };

const TIMEFRAMES = [
  { label: "1m", secs: 60 },
  { label: "5m", secs: 300 },
  { label: "15m", secs: 900 },
  { label: "1H", secs: 3600 },
  { label: "6H", secs: 21600 },
  { label: "1D", secs: 86400 },
] as const;
const TYPES = ["Candles", "Line", "Area"] as const;
type ChartType = (typeof TYPES)[number];

export function PriceChart({
  symbol,
  lines,
  height = 420,
  label,
  depth,
}: {
  symbol: AssetSymbol;
  lines: ChartLine[];
  height?: number;
  /** Shown in the legend, e.g. "SOL-PERP". */
  label?: string;
  /** Optional depth view; adds a Chart / Depth switch. */
  depth?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi>(null);
  const series = useRef<ISeriesApi<SeriesType>>(null);
  const priceLines = useRef<IPriceLine[]>([]);
  const candles = useRef<Candle[]>([]);
  const tick = useLivePrice(symbol);
  const [view, setView] = useState<"chart" | "depth">("chart");
  const [tf, setTf] = useState<number>(60);
  const [type, setType] = useState<ChartType>("Candles");
  const [legend, setLegend] = useState<Candle | null>(null);
  const [first, setFirst] = useState<number | null>(null);

  const toPoint = (c: Candle) =>
    type === "Candles" ? { ...c, time: c.time as UTCTimestamp } : { time: c.time as UTCTimestamp, value: c.close };

  useEffect(() => {
    if (!box.current || view !== "chart") return;
    const c = createChart(box.current, {
      height,
      layout: { background: { color: "transparent" }, textColor: "#8d8a83", fontFamily: "var(--font-jetbrains-mono)", fontSize: 11 },
      grid: { vertLines: { color: "rgba(255,255,255,0.03)" }, horzLines: { color: "rgba(255,255,255,0.035)" } },
      rightPriceScale: { borderColor: "#242428" },
      timeScale: { borderColor: "#242428", timeVisible: tf < 86400, secondsVisible: false },
      crosshair: {
        vertLine: { color: "#5b5955", labelBackgroundColor: "#18181b" },
        horzLine: { color: "#5b5955", labelBackgroundColor: "#18181b" },
      },
      autoSize: true,
    });
    const s =
      type === "Candles"
        ? c.addSeries(CandlestickSeries, {
            upColor: "#5ee0a1",
            downColor: "#ff6b81",
            borderVisible: false,
            wickUpColor: "#5ee0a1",
            wickDownColor: "#ff6b81",
          })
        : type === "Line"
          ? c.addSeries(LineSeries, { color: "#f3efe6", lineWidth: 2 })
          : c.addSeries(AreaSeries, {
              lineColor: "#ff7a1a",
              topColor: "rgba(255,122,26,0.28)",
              bottomColor: "rgba(255,122,26,0.02)",
              lineWidth: 2,
            });
    chart.current = c;
    series.current = s as ISeriesApi<SeriesType>;
    priceLines.current = [];
    let alive = true;
    fetchCandles(symbol, tf).then((cs) => {
      if (!alive || !cs.length) return;
      candles.current = cs;
      s.setData(cs.map(toPoint) as never);
      setFirst(cs[0].open);
      setLegend(cs[cs.length - 1]);
      c.timeScale().fitContent();
      drawLines();
    });
    const onMove = (p: MouseEventParams) => {
      const t = p.time as number | undefined;
      const hit = t ? candles.current.find((x) => x.time === t) : undefined;
      setLegend(hit ?? candles.current[candles.current.length - 1] ?? null);
    };
    c.subscribeCrosshairMove(onMove);
    return () => {
      alive = false;
      c.unsubscribeCrosshairMove(onMove);
      c.remove();
      chart.current = null;
      series.current = null;
      priceLines.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, height, tf, type, view]);

  // Fold live Pyth ticks into the current bucket for the selected timeframe.
  useEffect(() => {
    const s = series.current;
    const cs = candles.current;
    if (!s || !tick || !cs.length) return;
    const bucket = Math.floor(tick.ts / tf) * tf;
    const prev = cs[cs.length - 1];
    if (bucket < prev.time) return;
    const next: Candle =
      prev.time === bucket
        ? { ...prev, high: Math.max(prev.high, tick.price), low: Math.min(prev.low, tick.price), close: tick.price }
        : { time: bucket, open: prev.close, high: tick.price, low: tick.price, close: tick.price };
    if (prev.time === bucket) cs[cs.length - 1] = next;
    else cs.push(next);
    s.update(toPoint(next) as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  function drawLines() {
    const s = series.current;
    if (!s) return;
    priceLines.current.forEach((l) => s.removePriceLine(l));
    priceLines.current = lines.map((l) =>
      s.createPriceLine({
        price: l.price,
        color: l.color,
        lineWidth: 1,
        lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid,
        axisLabelVisible: true,
        title: l.title,
      }),
    );
  }
  const linesKey = JSON.stringify(lines);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(drawLines, [linesKey]);

  const last = tick?.price ?? legend?.close;
  const change = first && last ? ((last - first) / first) * 100 : null;

  return (
    <div>
      <div className="flex items-center gap-6 border-b hairline px-4">
        {(depth ? (["chart", "depth"] as const) : (["chart"] as const)).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`relative py-3 text-[14px] capitalize transition ${view === v ? "text-paper" : "text-muted hover:text-paper"}`}
          >
            {v}
            {view === v && <motion.span layoutId={`chart-tab-${symbol}`} className="absolute inset-x-0 -bottom-px h-0.5 bg-paper" />}
          </button>
        ))}
        <div className="ml-auto flex items-baseline gap-2">
          <span className="num text-[16px]">{last ? fmtUsd(last) : "—"}</span>
          {change != null && (
            <span className={`num text-[12px] ${change >= 0 ? "text-yes" : "text-no"}`}>
              {change >= 0 ? "+" : ""}
              {change.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      {view === "depth" && depth ? (
        <div style={{ height: height + 70 }}>{depth}</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1 border-b hairline px-3 py-2">
            {TIMEFRAMES.map((t) => (
              <button
                key={t.label}
                onClick={() => setTf(t.secs)}
                className={`num rounded-md px-2.5 py-1 text-[12px] transition ${tf === t.secs ? "bg-ink-3 text-paper" : "text-muted hover:text-paper"}`}
              >
                {t.label}
              </button>
            ))}
            <span className="mx-2 h-4 w-px bg-line" />
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`rounded-md px-2.5 py-1 text-[12px] transition ${type === t ? "bg-ink-3 text-paper" : "text-muted hover:text-paper"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="num flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-3 text-[11px]">
            <span className="font-sans text-[12px] font-semibold text-paper">{label ?? `${symbol}/USD`}</span>
            <span className="text-faint">
              {TIMEFRAMES.find((t) => t.secs === tf)?.label} · Coinbase history + live Pyth
            </span>
            {legend && (
              <span className="flex gap-3 text-muted">
                {(["open", "high", "low", "close"] as const).map((k) => (
                  <span key={k}>
                    {k[0].toUpperCase()} <span className="text-paper">{legend[k].toFixed(legend[k] < 10 ? 4 : 2)}</span>
                  </span>
                ))}
              </span>
            )}
          </div>
          <div ref={box} style={{ height }} className="w-full" />
        </>
      )}
    </div>
  );
}
