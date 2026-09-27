import { AnchorProvider, BN } from "@anchor-lang/core";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getComputationAccAddress,
  getExecutingPoolAccAddress,
  getMempoolAccAddress,
  getMXEAccAddress,
  getMXEPublicKey,
  RescueCipher,
  x25519,
} from "@arcium-hq/client";
import deployment from "@/deployment.json";
import { ata, baseConn, pdas, SEALED_ID, sealedProgram, sendTx } from "./wick";

const CLUSTER_OFFSET = Number(
  (deployment as unknown as { arciumClusterOffset?: number }).arciumClusterOffset ?? 0,
);

function randomBytes(n: number) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

function arciumAccounts(offset: BN, circuit: string) {
  return {
    mxeAccount: getMXEAccAddress(SEALED_ID),
    mempoolAccount: getMempoolAccAddress(CLUSTER_OFFSET),
    executingPool: getExecutingPoolAccAddress(CLUSTER_OFFSET),
    computationAccount: getComputationAccAddress(CLUSTER_OFFSET, offset),
    compDefAccount: getCompDefAccAddress(SEALED_ID, Buffer.from(getCompDefAccOffset(circuit)).readUInt32LE()),
    clusterAccount: getClusterAccAddress(CLUSTER_OFFSET),
  };
}

let mxeKey: Uint8Array | null = null;
async function mxePublicKey(wallet: AnchorWallet) {
  if (mxeKey) return mxeKey;
  const provider = new AnchorProvider(baseConn, wallet, { commitment: "confirmed" });
  for (let i = 0; i < 5; i++) {
    const k = await getMXEPublicKey(provider, SEALED_ID).catch(() => null);
    if (k) return (mxeKey = k);
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error("Arcium MXE key unavailable");
}

/**
 * Encrypts {side, amount} to the MXE and escrows `deposit`. The amount is clamped to the
 * deposit inside MPC; chain observers see only the deposit.
 */
async function placeOnce(
  wallet: AnchorWallet,
  market: PublicKey,
  side: "yes" | "no",
  amountUsdc: number,
  depositUsdc: number,
) {
  const priv = x25519.utils.randomSecretKey();
  const pub = x25519.getPublicKey(priv);
  const shared = x25519.getSharedSecret(priv, await mxePublicKey(wallet));
  const cipher = new RescueCipher(shared);
  const nonce = randomBytes(16);
  const amount = BigInt(Math.round(amountUsdc * 1e6));
  const [sideCt, amountCt] = cipher.encrypt([side === "yes" ? 1n : 0n, amount], nonce);

  const offset = new BN(randomBytes(8), "hex");
  const batch = pdas.batch(market);
  const ix = await sealedProgram(baseConn, wallet)
    .methods.placeOrder(
      offset,
      Array.from(sideCt),
      Array.from(amountCt),
      Array.from(pub),
      new BN(Buffer.from(nonce).reverse()),
      new BN(Math.round(depositUsdc * 1e6)),
    )
    .accountsPartial({
      payer: wallet.publicKey,
      batch,
      order: pdas.order(batch, wallet.publicKey),
      batchVault: pdas.batchVault(batch),
      ownerToken: ata(wallet.publicKey),
      ...arciumAccounts(offset, "place_order"),
    })
    .instruction();
  return sendTx(baseConn, wallet, [ix]);
}

const BATCH_BUSY = 6004;

/**
 * Encrypts {side, amount} to the MXE and escrows `deposit`. The batch processes one order at a
 * time (~2s per MPC round trip), so a busy batch is retried a few times before giving up.
 */
export async function placeSealedOrder(
  wallet: AnchorWallet,
  market: PublicKey,
  side: "yes" | "no",
  amountUsdc: number,
  depositUsdc: number,
) {
  const batch = pdas.batch(market);
  // Wait for the in-flight order (if any) to clear so the wallet isn't asked to sign twice.
  for (let i = 0; i < 12; i++) {
    const b = await sealedProgram(baseConn).account.sealedBatch.fetch(batch);
    if (b.busySince.toNumber() === 0 || Date.now() / 1000 - b.busySince.toNumber() > 180) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  for (let attempt = 0; ; attempt++) {
    try {
      return await placeOnce(wallet, market, side, amountUsdc, depositUsdc);
    } catch (e) {
      const busy = String((e as Error).message).includes(`"Custom":${BATCH_BUSY}`);
      if (!busy || attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
}

export async function withdrawSealed(wallet: AnchorWallet, market: PublicKey) {
  const batch = pdas.batch(market);
  const ix = await sealedProgram(baseConn, wallet)
    .methods.withdrawPayout()
    .accountsPartial({
      owner: wallet.publicKey,
      batch,
      order: pdas.order(batch, wallet.publicKey),
      batchVault: pdas.batchVault(batch),
      ownerToken: ata(wallet.publicKey),
    })
    .instruction();
  return sendTx(baseConn, wallet, [ix]);
}
