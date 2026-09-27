import { AnchorProvider, Program, Wallet } from "@anchor-lang/core";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { CrossbarClient, IOracleFeed } from "@switchboard-xyz/common";
import * as sb from "@switchboard-xyz/on-demand";
import fs from "fs";
import os from "os";
import path from "path";
import marketsIdl from "../target/idl/wick_markets.json";
import sealedIdl from "../target/idl/wick.json";
import type { WickMarkets } from "../target/types/wick_markets";
import type { Wick } from "../target/types/wick";

export const ROOT = path.resolve(__dirname, "..");
export const DEPLOYMENT_PATH = path.join(ROOT, "app/src/deployment.json");

export const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
export const ER_URL = process.env.ER_URL ?? "https://devnet.magicblock.app";
export const ARCIUM_CLUSTER_OFFSET = 456;
/** Pyth push-oracle shard the keeper maintains for Wick (shard 0 is Pyth's sponsored one). */
export const PYTH_SHARD = 7;

export const conn = new Connection(RPC_URL, "confirmed");
export const erConn = new Connection(ER_URL, "confirmed");

export function loadKeypair(p = process.env.KEYPAIR ?? path.join(os.homedir(), ".config/solana/id.json")) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
}

export const admin = loadKeypair();
export const wallet = new Wallet(admin);

export const markets = new Program<WickMarkets>(
  marketsIdl as WickMarkets,
  new AnchorProvider(conn, wallet, { commitment: "confirmed" }),
);
export const marketsEr = new Program<WickMarkets>(
  marketsIdl as WickMarkets,
  new AnchorProvider(erConn, wallet, { commitment: "confirmed" }),
);
export const sealed = new Program<Wick>(sealedIdl as Wick, new AnchorProvider(conn, wallet, { commitment: "confirmed" }));

export type AssetCfg = {
  symbol: "SOL" | "BTC" | "ETH";
  pythFeedId: string;
  /** Switchboard feed built from exchange APIs only, so it's independent of Pyth. */
  sbFeed: IOracleFeed;
};

const job = (url: string, jsonPath: string) => ({
  tasks: [{ httpTask: { url } }, { jsonParseTask: { path: jsonPath } }],
});

function feed(name: string, jobs: ReturnType<typeof job>[]) {
  return { name, jobs, minJobResponses: 2, minOracleSamples: 1, maxJobRangePct: 1_000_000_000 } as IOracleFeed;
}

export const ASSETS: AssetCfg[] = [
  {
    symbol: "SOL",
    pythFeedId: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    sbFeed: feed("Wick SOL/USD", [
      job("https://api.coinbase.com/v2/prices/SOL-USD/spot", "$.data.amount"),
      job("https://api.kraken.com/0/public/Ticker?pair=SOLUSD", "$.result.SOLUSD.c[0]"),
      job("https://www.bitstamp.net/api/v2/ticker/solusd/", "$.last"),
    ]),
  },
  {
    symbol: "BTC",
    pythFeedId: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    sbFeed: feed("Wick BTC/USD", [
      job("https://api.coinbase.com/v2/prices/BTC-USD/spot", "$.data.amount"),
      job("https://api.kraken.com/0/public/Ticker?pair=XBTUSD", "$.result.XXBTZUSD.c[0]"),
      job("https://www.bitstamp.net/api/v2/ticker/btcusd/", "$.last"),
    ]),
  },
  {
    symbol: "ETH",
    pythFeedId: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    sbFeed: feed("Wick ETH/USD", [
      job("https://api.coinbase.com/v2/prices/ETH-USD/spot", "$.data.amount"),
      job("https://api.kraken.com/0/public/Ticker?pair=ETHUSD", "$.result.XETHZUSD.c[0]"),
      job("https://www.bitstamp.net/api/v2/ticker/ethusd/", "$.last"),
    ]),
  },
];

export type Deployment = {
  cluster: string;
  marketsProgram: string;
  sealedProgram: string;
  mint: string;
  house: string;
  arciumClusterOffset: number;
  oracles: Record<string, { pythAccount: string; sbQuote: string; sbFeedHash: string }>;
  markets: string[];
};

export function readDeployment(): Deployment {
  return JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, "utf8"));
}

export function writeDeployment(d: Deployment) {
  fs.writeFileSync(DEPLOYMENT_PATH, JSON.stringify(d, null, 2) + "\n");
}

export const crossbar = new CrossbarClient("https://crossbar.switchboard.xyz");

let queue: sb.Queue | null = null;
export async function sbQueue() {
  if (!queue) queue = await sb.getDefaultDevnetQueue(RPC_URL);
  return queue;
}

export async function send(c: Connection, ixs: TransactionInstruction[], signers: Keypair[] = [admin]) {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = signers[0].publicKey;
  tx.recentBlockhash = (await c.getLatestBlockhash("confirmed")).blockhash;
  tx.sign(...signers);
  const sig = await c.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  const r = await c.confirmTransaction(sig, "confirmed");
  if (r.value.err) throw new Error(`tx ${sig} failed: ${JSON.stringify(r.value.err)}`);
  return sig;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const pk = (s: string) => new PublicKey(s);

export function log(...a: unknown[]) {
  console.log(new Date().toISOString().slice(11, 19), ...a);
}
