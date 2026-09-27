import { HermesClient } from "@pythnetwork/hermes-client";
import {
  PRO_COMPATIBLE_PUSH_ORACLE_PROGRAM_ID,
  PRO_COMPATIBLE_RECEIVER_PROGRAM_ID,
  PRO_COMPATIBLE_WORMHOLE_PROGRAM_ID,
  PythSolanaReceiver,
} from "@pythnetwork/pyth-solana-receiver";
import * as sb from "@switchboard-xyz/on-demand";
import { ComputeBudgetProgram, Ed25519Program, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { admin, AssetCfg, conn, crossbar, log, PYTH_SHARD, sbQueue, wallet } from "./lib";

// Pyth Core (since 2026-08-26): Hermes needs an API key and Solana uses the pro-compatible programs.
export const hermes = new HermesClient(process.env.PYTH_HERMES_URL ?? "https://pyth.dourolabs.app/hermes", {
  accessToken: process.env.PYTH_API_KEY,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const receiver = new PythSolanaReceiver({
  connection: conn,
  wallet: wallet as any,
  receiverProgramId: PRO_COMPATIBLE_RECEIVER_PROGRAM_ID,
  pushOracleProgramId: PRO_COMPATIBLE_PUSH_ORACLE_PROGRAM_ID,
  wormholeProgramId: PRO_COMPATIBLE_WORMHOLE_PROGRAM_ID,
});

export function pythAccount(feedId: string) {
  return receiver.getPriceFeedAccountAddress(PYTH_SHARD, feedId);
}

/** Pushes the latest Hermes prices into Wick's Pyth push-feed accounts. */
export async function pushPyth(assets: AssetCfg[]) {
  const upd = await hermes.getLatestPriceUpdates(
    assets.map((a) => a.pythFeedId),
    { encoding: "base64" },
  );
  const b = receiver.newTransactionBuilder({ closeUpdateAccounts: true });
  await b.addUpdatePriceFeed(upd.binary.data, PYTH_SHARD);
  const txs = await b.buildVersionedTransactions({ computeUnitPriceMicroLamports: 1 });
  await receiver.provider.sendAll(txs, { skipPreflight: true });
}

export async function sbFeedHash(a: AssetCfg) {
  const { feedId } = await crossbar.storeOracleFeed(a.sbFeed);
  return feedId.startsWith("0x") ? feedId : `0x${feedId}`;
}

export async function sbQuoteAccount(feedHash: string) {
  const q = await sbQueue();
  return sb.OracleQuote.getCanonicalPubkey(q.pubkey, [feedHash])[0];
}

/** Writes a fresh Ed25519-verified Switchboard quote for one asset. */
export async function pushSwitchboard(feedHash: string) {
  const q = await sbQueue();
  const ixs = await q.fetchManagedUpdateIxs(crossbar, [feedHash], {
    numSignatures: 1,
    payer: admin.publicKey,
  });
  const all = sb.finalizeManagedUpdateInstructions([
    ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
    ...ixs,
  ]);
  // The devnet quote program still checks absolute Ed25519 instruction indices, while this SDK
  // writes Solana's "current instruction" sentinel (0xffff). Rewrite them to absolute indices.
  all.forEach((ix, i) => {
    if (!ix.programId.equals(Ed25519Program.programId)) return;
    const n = ix.data[0];
    for (let k = 0; k < n; k++) {
      const rec = 2 + k * 14;
      for (const off of [2, 6, 12]) ix.data.writeUInt16LE(i, rec + off);
    }
  });
  const msg = new TransactionMessage({
    payerKey: admin.publicKey,
    recentBlockhash: (await conn.getLatestBlockhash()).blockhash,
    instructions: all,
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([admin]);
  const sig = await conn.sendTransaction(tx, { preflightCommitment: "processed" });
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}

/** Refreshes Pyth for every asset and Switchboard for the listed ones. */
export async function refresh(assets: AssetCfg[], hashes: Record<string, string>, pyth: boolean, sbFor: AssetCfg[]) {
  const jobs = [
    pyth ? pushPyth(assets).catch((e) => log("pyth push failed", String(e).slice(0, 160))) : null,
    ...sbFor.map((a) =>
      pushSwitchboard(hashes[a.symbol]).catch((e) => log(`sb ${a.symbol} failed`, String(e).slice(0, 160))),
    ),
  ];
  await Promise.all(jobs);
}
