// Hidden stop-loss smoke test: open a 20x long, arm an encrypted stop that is already crossed,
// and wait for the keeper's Arcium check + close_by_stop to close it on the ER.
import { AnchorProvider, BN, Program, Wallet } from "@anchor-lang/core";
import { getMXEPublicKey, RescueCipher, x25519 } from "@arcium-hq/client";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import marketsIdl from "../target/idl/wick_markets.json";
import sealedIdl from "../target/idl/wick.json";
import type { WickMarkets } from "../target/types/wick_markets";
import type { Wick } from "../target/types/wick";
import { admin, conn, erConn, log, readDeployment, ROOT, send, sleep } from "./lib";
import { perpPda, symbolBytes } from "./perps-setup";

const USDC = 1_000_000;

(async () => {
  const d = readDeployment();
  const mint = new PublicKey(d.mint);
  const user = Keypair.generate();
  const w = new Wallet(user);
  const mk = new Program<WickMarkets>(marketsIdl as WickMarkets, new AnchorProvider(conn, w, { commitment: "confirmed" }));
  const er = new Program<WickMarkets>(marketsIdl as WickMarkets, new AnchorProvider(erConn, w, { commitment: "confirmed" }));
  const sl = new Program<Wick>(sealedIdl as Wick, new AnchorProvider(conn, w, { commitment: "confirmed" }));
  const faucet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(ROOT, "keys/faucet.json"), "utf8"))));
  const ata = getAssociatedTokenAddressSync(mint, user.publicKey);

  await send(conn, [SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: user.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })]);
  await send(conn, [
    createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, ata, user.publicKey, mint),
    createMintToInstruction(mint, ata, faucet.publicKey, BigInt(200 * USDC)),
  ], [admin, faucet]);
  const account = perpPda.account(user.publicKey);
  await send(conn, [
    await mk.methods.openPerpAccount().accountsPartial({ owner: user.publicKey }).instruction(),
    await mk.methods.perpDeposit(new BN(100 * USDC)).accountsPartial({ owner: user.publicKey, account, ownerToken: ata }).instruction(),
    await mk.methods.delegatePerpAccount().accountsPartial({ payer: user.publicKey }).instruction(),
  ], [user]);
  for (let i = 0; i < 20 && !(await erConn.getAccountInfo(account)); i++) await sleep(500);

  const market = perpPda.market("SOL");
  await er.methods
    .openPerp({ long: {} }, new BN(50 * USDC), 200, new BN("100000000000000"))
    .accountsPartial({ signer: user.publicKey, pool: perpPda.pool(), market, account, priceUpdate: new PublicKey(d.oracles.SOL.pythAccount) })
    .rpc({ commitment: "confirmed" });
  const entry = (await er.account.perpAccount.fetch(account)).slots[0].entryPrice.toNumber() / 1e8;
  log(`opened 20x long SOL at $${entry.toFixed(3)}`);
  await sleep(2000);

  // Stop 0.3% above entry: for a long that's already crossed, so the next check must fire.
  const stopPrice = entry * 1.003;
  const priv = x25519.utils.randomSecretKey();
  const cipher = new RescueCipher(x25519.getSharedSecret(priv, (await getMXEPublicKey(sl.provider as never, sl.programId))!));
  const nonce = randomBytes(16);
  const [ct] = cipher.encrypt([BigInt(Math.round(stopPrice * 1e8))], nonce);
  const stop = PublicKey.findProgramAddressSync(
    [Buffer.from("stop"), user.publicKey.toBuffer(), symbolBytes("SOL"), Buffer.from([1])],
    sl.programId,
  )[0];
  await sl.methods
    .setStop(Array.from(symbolBytes("SOL")), true, Array.from(x25519.getPublicKey(priv)), new BN(Buffer.from(nonce).reverse()), Array.from(ct))
    .accountsPartial({ owner: user.publicKey, stop })
    .rpc({ commitment: "confirmed" });
  log("hidden stop armed (only ciphertext on-chain); waiting for keeper + Arcium…");

  const t0 = Date.now();
  for (let i = 0; i < 60; i++) {
    const st = await sl.account.stopOrder.fetch(stop);
    const slot = (await er.account.perpAccount.fetch(account)).slots[0];
    if (slot.size.isZero()) {
      log(`position closed by hidden stop after ${((Date.now() - t0) / 1000).toFixed(0)}s (${st.checks} MPC checks)`);
      const acc = await er.account.perpAccount.fetch(account);
      log(`trader credit now $${(acc.credit.toNumber() / USDC).toFixed(4)}`);
      return;
    }
    if (i % 5 === 0) log(`  checks=${st.checks} triggered=${st.triggered}`);
    await sleep(3000);
  }
  throw new Error("stop did not close the position within 3 minutes");
})().catch((e) => {
  console.error(String(e).slice(0, 600));
  process.exit(1);
});
