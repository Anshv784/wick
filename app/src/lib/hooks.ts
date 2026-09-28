"use client";

import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ata,
  baseConn,
  discoverMarketKeys,
  fetchMarkets,
  erConn,
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

/**
 * Keeps a delegated account live over the ER websocket (trades land in ~1s, so polling
 * alone would lag). Falls back to the poll for base-layer accounts.
 */
function useErStream<T>(
  key: PublicKey | undefined,
  located: Located<T> | null | undefined,
  name: "market" | "position",
  set: (v: Located<T>) => void,
) {
  const onEr = !!located?.onEr;
  useEffect(() => {
    if (!key || !onEr) return;
    const coder = marketsProgram(erConn).coder.accounts;
    const id = erConn.onAccountChange(key, (info) => {
      try {
        set({ data: coder.decode(name, info.data) as T, onEr: true });
      } catch {}
    });
    return () => {
      erConn.removeAccountChangeListener(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key?.toBase58(), onEr, name]);
}

export function useMarket(key: PublicKey | undefined) {
  const poll = usePoll<Located<MarketAccount> | null>(
    async () => (key ? fetchMarket(key) : null),
    4000,
    [key?.toBase58()],
  );
  const [live, setLive] = useState<Located<MarketAccount>>();
  useEffect(() => setLive(undefined), [poll.data]);
  useErStream(key, poll.data, "market", setLive);
  return { ...poll, data: live ?? poll.data };
}

export function useMarkets() {
  return usePoll(
    async () => {
      const rows = await fetchMarkets(await discoverMarketKeys());
      const now = Date.now() / 1000;
      const live = (m: MarketAccount) => "open" in (m.status as object) && m.expiry.toNumber() > now;
      return (rows.filter((r) => r.m) as { key: PublicKey; m: Located<MarketAccount> }[]).sort(
        (a, b) =>
          Number(live(b.m.data)) - Number(live(a.m.data)) || a.m.data.expiry.toNumber() - b.m.data.expiry.toNumber(),
      );
    },
    8000,
    [],
  );
}

export function usePosition(market: PublicKey | undefined) {
  const wallet = useAnchorWallet();
  const key = market && wallet ? pdas.position(market, wallet.publicKey) : undefined;
  const poll = usePoll<Located<PositionAccount> | null>(
    async () => (key ? fetchPosition(key) : null),
    4000,
    [key?.toBase58()],
  );
  const [live, setLive] = useState<Located<PositionAccount>>();
  useEffect(() => setLive(undefined), [poll.data]);
  useErStream(key, poll.data, "position", setLive);
  return { ...poll, data: live ?? poll.data };
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
