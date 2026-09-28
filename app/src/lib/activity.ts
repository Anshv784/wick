import { EventParser } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import { erConn, marketsProgram } from "./wick";

export type TradeRow = {
  sig: string;
  ts: number;
  side: "yes" | "no";
  isBuy: boolean;
  collateral: number;
  shares: number;
  yesBps: number;
};

/** Recent pool trades for a market, decoded from TradeEvent logs on the rollup. */
export async function fetchMarketTrades(market: PublicKey, limit = 60): Promise<TradeRow[]> {
  const sigs = await erConn.getSignaturesForAddress(market, { limit });
  const ok = sigs.filter((s) => !s.err);
  if (!ok.length) return [];
  const txs = await erConn.getTransactions(
    ok.map((s) => s.signature),
    { maxSupportedTransactionVersion: 0, commitment: "confirmed" },
  );
  const program = marketsProgram(erConn);
  const parser = new EventParser(program.programId, program.coder);
  const rows: TradeRow[] = [];
  txs.forEach((tx, i) => {
    const logs = tx?.meta?.logMessages;
    if (!logs) return;
    for (const ev of parser.parseLogs(logs)) {
      if (ev.name !== "tradeEvent") continue;
      const d = ev.data as {
        market: PublicKey;
        side: object;
        isBuy: boolean;
        collateral: { toNumber(): number };
        shares: { toNumber(): number };
        yesPriceBps: { toNumber(): number };
        ts: { toNumber(): number };
      };
      if (!d.market.equals(market)) continue;
      rows.push({
        sig: ok[i].signature,
        ts: d.ts.toNumber(),
        side: "yes" in d.side ? "yes" : "no",
        isBuy: d.isBuy,
        collateral: d.collateral.toNumber() / 1e6,
        shares: d.shares.toNumber() / 1e6,
        yesBps: d.yesPriceBps.toNumber(),
      });
    }
  });
  return rows.sort((a, b) => a.ts - b.ts);
}
