// Session keys: a browser-held key the wallet authorises once (24h). It signs every rollup
// transaction, so trades need no wallet popup and never hit the wallet's base-layer
// simulation (which is what made rollup transactions show up red).

import { BN } from "@anchor-lang/core";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { baseConn, erConn, marketsProgram, MARKETS_ID, sendTx } from "./wick";

const TTL_SECS = 24 * 3600;
const storeKey = (owner: PublicKey) => `wick.session.${owner.toBase58()}`;

export const sessionPda = (owner: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("session"), owner.toBuffer()], MARKETS_ID)[0];

type Stored = { secret: number[]; expiresAt: number };

function load(owner: PublicKey): { kp: Keypair; expiresAt: number } | null {
  try {
    const raw = localStorage.getItem(storeKey(owner));
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    return { kp: Keypair.fromSecretKey(Uint8Array.from(s.secret)), expiresAt: s.expiresAt };
  } catch {
    return null;
  }
}

function save(owner: PublicKey, kp: Keypair, expiresAt: number) {
  try {
    localStorage.setItem(storeKey(owner), JSON.stringify({ secret: Array.from(kp.secretKey), expiresAt } satisfies Stored));
  } catch {}
}

/** The local session key, if it's still valid on-chain for this owner. */
export async function activeSession(owner: PublicKey): Promise<Keypair | null> {
  const local = load(owner);
  if (!local || local.expiresAt < Date.now() / 1000 + 60) return null;
  const onchain = await marketsProgram(baseConn).account.session.fetchNullable(sessionPda(owner)).catch(() => null);
  return onchain && onchain.key.equals(local.kp.publicKey) && onchain.expiresAt.toNumber() > Date.now() / 1000 ? local.kp : null;
}

/**
 * Instructions that register a fresh session key. Callers fold these into a base transaction
 * the user is signing anyway (e.g. a deposit), so enabling one-click trading costs no extra popup.
 */
export async function sessionSetupIxs(wallet: AnchorWallet): Promise<TransactionInstruction[]> {
  if (await activeSession(wallet.publicKey)) return [];
  const kp = Keypair.generate();
  const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECS;
  save(wallet.publicKey, kp, expiresAt);
  return [
    await marketsProgram(baseConn, wallet)
      .methods.setSession(kp.publicKey, new BN(expiresAt))
      .accountsPartial({ owner: wallet.publicKey })
      .instruction(),
  ];
}

/** Sends rollup instructions signed by the session key (no wallet involved). */
export async function sendAsSession(kp: Keypair, ixs: TransactionInstruction[]) {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = kp.publicKey;
  tx.recentBlockhash = (await erConn.getLatestBlockhash("confirmed")).blockhash;
  tx.sign(kp);
  const sig = await erConn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  const res = await erConn.confirmTransaction(sig, "confirmed");
  if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
  return sig;
}

/**
 * Sends a rollup instruction signed by the session key when one is active (no wallet popup,
 * no wallet simulation), falling back to the wallet otherwise.
 */
export async function sendEr(
  wallet: AnchorWallet,
  build: (signer: PublicKey, session: PublicKey | null) => Promise<TransactionInstruction>,
) {
  const kp = await activeSession(wallet.publicKey);
  if (kp) return sendAsSession(kp, [await build(kp.publicKey, sessionPda(wallet.publicKey))]);
  return sendTx(erConn, wallet, [await build(wallet.publicKey, null)]);
}

/** One wallet signature to turn on one-click trading for 24h. */
export async function enableSession(wallet: AnchorWallet) {
  const ixs = await sessionSetupIxs(wallet);
  if (!ixs.length) return null;
  return sendTx(baseConn, wallet, ixs);
}
