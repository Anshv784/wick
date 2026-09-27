"use client";

import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";
import deployment from "@/deployment.json";
import {
  ata,
  baseConn,
  BookAccount,
  fetchMarket,
  fetchPosition,
  Located,
  MarketAccount,
  marketsProgram,
  MINT,
  pdas,
  PositionAccount,
  TicketAccount,
} from "./wick";

export const MARKET_KEYS: PublicKey[] = (deployment.markets as string[]).map((k) => new PublicKey(k));

/** Polls `load` every `ms`; returns data, a manual refresh, and the first-load flag. */
export function usePoll<T>(load: () => Promise<T>, ms: number, deps: unknown[]) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  const refresh = useCallback(async () => {
    try {
      setData(await loadRef.current());
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    setLoading(true);
    refresh();
    const t = setInterval(refresh, ms);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, refresh, loading };
}

export function useMarket(key: PublicKey | undefined) {
  return usePoll<Located<MarketAccount> | null>(
    async () => (key ? fetchMarket(key) : null),
    2500,
    [key?.toBase58()],
  );
}

export function useMarkets() {
  return usePoll(
    async () => {
      const rows = await Promise.all(MARKET_KEYS.map(async (k) => ({ key: k, m: await fetchMarket(k) })));
      return rows.filter((r) => r.m) as { key: PublicKey; m: Located<MarketAccount> }[];
    },
    5000,
    [],
  );
}

export function usePosition(market: PublicKey | undefined) {
  const wallet = useAnchorWallet();
  return usePoll<Located<PositionAccount> | null>(
    async () => (market && wallet ? fetchPosition(pdas.position(market, wallet.publicKey)) : null),
    2500,
    [market?.toBase58(), wallet?.publicKey.toBase58()],
  );
}

export function useBook(market: PublicKey | undefined) {
  return usePoll<BookAccount | null>(
    async () => (market ? marketsProgram(baseConn).account.touchBook.fetchNullable(pdas.book(market)) : null),
    4000,
    [market?.toBase58()],
  );
}

export type TicketRow = { key: PublicKey; t: TicketAccount };

/** Tickets owned by the connected wallet, optionally for one book. */
export function useTickets(book?: PublicKey) {
  const wallet = useAnchorWallet();
  return usePoll<TicketRow[]>(
    async () => {
      if (!wallet) return [];
      const filters = [{ memcmp: { offset: 8 + 32, bytes: wallet.publicKey.toBase58() } }];
      if (book) filters.push({ memcmp: { offset: 8, bytes: book.toBase58() } });
      const rows = await marketsProgram(baseConn).account.touchTicket.all(filters);
      return rows
        .map((r) => ({ key: r.publicKey, t: r.account }))
        .sort((a, b) => b.t.createdAt.toNumber() - a.t.createdAt.toNumber());
    },
    5000,
    [wallet?.publicKey.toBase58(), book?.toBase58()],
  );
}

export function useUsdc() {
  const wallet = useAnchorWallet();
  return usePoll<number>(
    async () => {
      if (!wallet || !MINT) return 0;
      try {
        const b = await baseConn.getTokenAccountBalance(ata(wallet.publicKey));
        return Number(b.value.amount) / 1e6;
      } catch {
        return 0;
      }
    },
    6000,
    [wallet?.publicKey.toBase58()],
  );
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
