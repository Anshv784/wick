"use client";

import {
  CandlestickSeries,
  createChart,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  LineStyle,
  UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { AssetSymbol } from "@/lib/assets";
import { Candle, fetchCandles, useLivePrice } from "@/lib/prices";

export type ChartLine = { price: number; color: string; title: string; dashed?: boolean };

export function PriceChart({
  symbol,
  lines,
  height = 420,
}: {
  symbol: AssetSymbol;
  lines: ChartLine[];
  height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi>(null);
  const series = useRef<ISeriesApi<"Candlestick">>(null);
  const priceLines = useRef<IPriceLine[]>([]);
  const lastCandle = useRef<Candle>(null);
  const tick = useLivePrice(symbol);

  useEffect(() => {
    if (!box.current) return;
    const c = createChart(box.current, {
      height,
      layout: {
        background: { color: "transparent" },
        textColor: "#8d8a83",
        fontFamily: "var(--font-jetbrains-mono)",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.035)" },
      },
      rightPriceScale: { borderColor: "#242428" },
      timeScale: { borderColor: "#242428", timeVisible: true, secondsVisible: false },
      crosshair: {
        vertLine: { color: "#5b5955", labelBackgroundColor: "#18181b" },
        horzLine: { color: "#5b5955", labelBackgroundColor: "#18181b" },
      },
      autoSize: true,
    });
    const s = c.addSeries(CandlestickSeries, {
      upColor: "#5ee0a1",
      downColor: "#ff6b81",
      borderVisible: false,
      wickUpColor: "#5ee0a1",
      wickDownColor: "#ff6b81",
    });
    chart.current = c;
    series.current = s;
    let alive = true;
    fetchCandles(symbol).then((cs) => {
      if (!alive || !cs.length) return;
      s.setData(cs.map((x) => ({ ...x, time: x.time as UTCTimestamp })));
      lastCandle.current = cs[cs.length - 1];
      c.timeScale().scrollToRealTime();
    });
    return () => {
      alive = false;
      c.remove();
      chart.current = null;
      series.current = null;
      priceLines.current = [];
    };
  }, [symbol, height]);

  // Fold live Hermes ticks into the current 1-minute candle.
  useEffect(() => {
    const s = series.current;
    if (!s || !tick) return;
    const minute = Math.floor(tick.ts / 60) * 60;
    const prev = lastCandle.current;
    const next: Candle =
      prev && prev.time === minute
        ? { ...prev, high: Math.max(prev.high, tick.price), low: Math.min(prev.low, tick.price), close: tick.price }
        : { time: minute, open: prev?.close ?? tick.price, high: tick.price, low: tick.price, close: tick.price };
    if (prev && minute < prev.time) return;
    lastCandle.current = next;
    s.update({ ...next, time: next.time as UTCTimestamp });
  }, [tick]);

  const linesKey = JSON.stringify(lines);
  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesKey]);

  return <div ref={box} style={{ height }} className="w-full" />;
}
