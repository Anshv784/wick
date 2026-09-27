import { AnchorProvider, BN, Program } from "@anchor-lang/core";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import marketsIdl from "@/idl/wick_markets.json";
import sealedIdl from "@/idl/wick.json";
import type { WickMarkets } from "@/idl/wick_markets";
import type { Wick } from "@/idl/wick";
import deployment from "@/deployment.json";
import type { AssetSymbol } from "./assets";

export const BASE_RPC = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
export const ER_RPC = process.env.NEXT_PUBLIC_ER_URL ?? "https://devnet.magicblock.app";
export const DELEGATION_PROGRAM = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");

export const baseConn = new Connection(BASE_RPC, "confirmed");
export const erConn = new Connection(ER_RPC, "confirmed");

export const MARKETS_ID = new PublicKey(deployment.marketsProgram);
export const SEALED_ID = new PublicKey(deployment.sealedProgram);
export const MINT = deployment.mint ? new PublicKey(deployment.mint) : null;

type DeployedAsset = { pythAccount: string; sbQuote: string };
export const ORACLES = (deployment as unknown as { oracles?: Record<AssetSymbol, DeployedAsset> })
  .oracles;

const readonlyWallet = {
  publicKey: PublicKey.default,
  signTransaction: async <T,>(t: T) => t,
  signAllTransactions: async <T,>(t: T[]) => t,
} as unknown as AnchorWallet;

export function marketsProgram(conn: Connection, wallet?: AnchorWallet) {
  const provider = new AnchorProvider(conn, wallet ?? readonlyWallet, { commitment: "confirmed" });
  return new Program<WickMarkets>(marketsIdl as WickMarkets, provider);
}

export function sealedProgram(conn: Connection, wallet?: AnchorWallet) {
  const provider = new AnchorProvider(conn, wallet ?? readonlyWallet, { commitment: "confirmed" });
  return new Program<Wick>(sealedIdl as Wick, provider);
}

const enc = (s: string) => Buffer.from(s);
const pda = (seeds: (Buffer | Uint8Array)[], program = MARKETS_ID) =>
  PublicKey.findProgramAddressSync(seeds, program)[0];

export const pdas = {
  market: (creator: PublicKey, id: number) =>
    pda([enc("market"), creator.toBuffer(), new BN(id).toArrayLike(Buffer, "le", 8)]),
  vault: (market: PublicKey) => pda([enc("vault"), market.toBuffer()]),
  position: (market: PublicKey, owner: PublicKey) =>
    pda([enc("position"), market.toBuffer(), owner.toBuffer()]),
  book: (market: PublicKey) => pda([enc("touch_book"), market.toBuffer()]),
  touchVault: (book: PublicKey) => pda([enc("touch_vault"), book.toBuffer()]),
  ticket: (book: PublicKey, id: number) =>
    pda([enc("ticket"), book.toBuffer(), new BN(id).toArrayLike(Buffer, "le", 8)]),
  batch: (market: PublicKey) => pda([enc("batch"), market.toBuffer()], SEALED_ID),
  batchVault: (batch: PublicKey) => pda([enc("batch_vault"), batch.toBuffer()], SEALED_ID),
  order: (batch: PublicKey, owner: PublicKey) =>
    pda([enc("order"), batch.toBuffer(), owner.toBuffer()], SEALED_ID),
};

export type MarketAccount = Awaited<
  ReturnType<ReturnType<typeof marketsProgram>["account"]["market"]["fetch"]>
>;
export type PositionAccount = Awaited<
  ReturnType<ReturnType<typeof marketsProgram>["account"]["position"]["fetch"]>
>;
export type BookAccount = Awaited<
  ReturnType<ReturnType<typeof marketsProgram>["account"]["touchBook"]["fetch"]>
>;
export type TicketAccount = Awaited<
  ReturnType<ReturnType<typeof marketsProgram>["account"]["touchTicket"]["fetch"]>
>;

export const HOUSE = deployment.house ? new PublicKey(deployment.house) : null;

/** Markets listed in deployment.json plus the house's sequential markets (ids 1, 2, 3, …). */
export async function discoverMarketKeys(): Promise<PublicKey[]> {
  const keys = new Map<string, PublicKey>((deployment.markets as string[]).map((k) => [k, new PublicKey(k)]));
  if (HOUSE) {
    for (let start = 1; ; start += 50) {
      const batch = Array.from({ length: 50 }, (_, i) => pdas.market(HOUSE, start + i));
      const infos = await baseConn.getMultipleAccountsInfo(batch);
      infos.forEach((info, i) => info && keys.set(batch[i].toBase58(), batch[i]));
      if (infos.every((i) => !i)) break;
    }
  }
  return [...keys.values()];
}

export type Located<T> = { data: T; onEr: boolean };

/** Reads an account from the ER when it is delegated, otherwise from base. */
export async function fetchLocated<T>(
  key: PublicKey,
  decode: (conn: Connection) => Promise<T | null>,
): Promise<Located<T> | null> {
  const info = await baseConn.getAccountInfo(key);
  if (!info) return null;
  const onEr = info.owner.equals(DELEGATION_PROGRAM);
  const data = await decode(onEr ? erConn : baseConn);
  return data ? { data, onEr } : null;
}

export const fetchMarket = (key: PublicKey) =>
  fetchLocated(key, (c) => marketsProgram(c).account.market.fetchNullable(key));

export const fetchPosition = (key: PublicKey) =>
  fetchLocated(key, (c) => marketsProgram(c).account.position.fetchNullable(key));

export async function sendTx(
  conn: Connection,
  wallet: AnchorWallet,
  ixs: TransactionInstruction[],
) {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash("confirmed")).blockhash;
  const signed = await wallet.signTransaction(tx);
  const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: true });
  const res = await conn.confirmTransaction(sig, "confirmed");
  if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
  return sig;
}

export function ata(owner: PublicKey) {
  if (!MINT) throw new Error("Mint not configured");
  return getAssociatedTokenAddressSync(MINT, owner);
}

export function ensureAtaIx(owner: PublicKey) {
  return createAssociatedTokenAccountIdempotentInstruction(owner, ata(owner), owner, MINT!);
}

export { SystemProgram, TOKEN_PROGRAM_ID };
