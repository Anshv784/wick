"use client";

import { useEffect, useState } from "react";
import { ASSETS, AssetSymbol } from "./assets";

const HERMES = "https://hermes.pyth.network";
const BENCHMARKS = "https://benchmarks.pyth.network/v1/shims/tradingview/history";

export type Tick = { price: number; conf: number; ts: number };
export type Candle = { time: number; open: number; high: number; low: number; close: number };

type Listener = (t: Tick) => void;
const listeners = new Map<string, Set<Listener>>();
const last = new Map<string, Tick>();
let source: EventSource | null = null;
let sourceIds = "";

function connect() {
  const ids = [...listeners.keys()].sort();
  const key = ids.join(",");
  if (key === sourceIds && source) return;
  source?.close();
  sourceIds = key;
  if (!ids.length) return;
  const qs = ids.map((id) => `ids[]=${id}`).join("&");
  source = new EventSource(`${HERMES}/v2/updates/price/stream?${qs}&parsed=true&allow_unordered=true`);
  source.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      for (const p of data.parsed ?? []) {
        const expo = p.price.expo as number;
        const tick: Tick = {
          price: Number(p.price.price) * 10 ** expo,
          conf: Number(p.price.conf) * 10 ** expo,
          ts: p.price.publish_time,
        };
        last.set(p.id, tick);
        listeners.get(p.id)?.forEach((l) => l(tick));
      }
    } catch {}
  };
  source.onerror = () => {
    source?.close();
    source = null;
    setTimeout(connect, 1500);
  };
}

export function useLivePrice(symbol: AssetSymbol | undefined) {
  const id = symbol ? ASSETS[symbol].pythFeedId : undefined;
  const [tick, setTick] = useState<Tick | undefined>(id ? last.get(id) : undefined);
  useEffect(() => {
    if (!id) return;
    const set = listeners.get(id) ?? new Set();
    set.add(setTick);
    listeners.set(id, set);
    connect();
    return () => {
      set.delete(setTick);
      if (!set.size) listeners.delete(id);
    };
  }, [id]);
  return tick;
}

export async function fetchCandles(symbol: AssetSymbol, resolution = "1", lookbackSecs = 6 * 3600) {
  const to = Math.floor(Date.now() / 1000);
  const from = to - lookbackSecs;
  const url = `${BENCHMARKS}?symbol=${encodeURIComponent(ASSETS[symbol].pythSymbol)}&resolution=${resolution}&from=${from}&to=${to}`;
  const r = await fetch(url);
  const d = await r.json();
  if (d.s !== "ok") return [] as Candle[];
  return (d.t as number[]).map((t, i) => ({
    time: t,
    open: d.o[i],
    high: d.h[i],
    low: d.l[i],
    close: d.c[i],
  })) as Candle[];
}
