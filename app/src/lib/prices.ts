"use client";

import { useEffect, useState } from "react";
import { ASSETS, AssetSymbol } from "./assets";


export type Tick = { price: number; conf: number; ts: number };
export type Candle = { time: number; open: number; high: number; low: number; close: number };

type Listener = (t: Tick) => void;
const listeners = new Map<string, Set<Listener>>();
const last = new Map<string, Tick>();
let source: EventSource | null = null;
let sourceIds = "";

let pending: ReturnType<typeof setTimeout> | null = null;

/** Batches subscription changes so several components mounting together open one stream. */
function scheduleConnect() {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    connect();
  }, 60);
}

function connect() {
  const ids = [...listeners.keys()].sort();
  const key = ids.join(",");
  if (key === sourceIds && source) return;
  source?.close();
  sourceIds = key;
  if (!ids.length) return;
  source = new EventSource(`/api/prices/stream?${ids.map((id) => `ids=${id}`).join("&")}`);
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
    setTimeout(scheduleConnect, 1500);
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
    scheduleConnect();
    return () => {
      set.delete(setTick);
      if (!set.size) listeners.delete(id);
    };
  }, [id]);
  return tick;
}

export async function fetchCandles(symbol: AssetSymbol): Promise<Candle[]> {
  const r = await fetch(`/api/candles?symbol=${symbol}`);
  return r.ok ? r.json() : [];
}

/**
 * Latest Switchboard quote for an asset, read straight from its canonical on-chain account
 * (same layout the program parses: "SBOracle" | queue | u16 len | Ed25519 payload).
 */
export function useSwitchboardPrice(symbol: AssetSymbol) {
  const [price, setPrice] = useState<number>();
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { baseConn, ORACLES } = await import("./wick");
      const { PublicKey } = await import("@solana/web3.js");
      const key = ORACLES?.[symbol]?.sbQuote;
      if (!key) return;
      const info = await baseConn.getAccountInfo(new PublicKey(key)).catch(() => null);
      if (!info || !alive) return;
      const d = info.data;
      const len = d.readUInt16LE(40);
      const ix = d.subarray(42, 42 + len);
      const msgOff = ix.readUInt16LE(10);
      const feed = ix.subarray(msgOff + 32, msgOff + 32 + 49);
      const v = feed.readBigUInt64LE(32) + (feed.readBigInt64LE(40) << 64n);
      setPrice(Number(v / 10n ** 10n) / 1e8);
    };
    load();
    const t = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [symbol]);
  return price;
}
