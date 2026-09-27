// End-to-end smoke test against devnet with a fresh user:
// faucet → deposit + delegate → buy/sell on the ER → touch ticket → sealed order.
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
import { arciumAccounts, randomOffset } from "./setup";

const DELEGATION = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");

(async () => {
  const d = readDeployment();
  const mint = new PublicKey(d.mint);
  const market = new PublicKey(d.markets[Number(process.env.MARKET_INDEX ?? 0)]);
  const user = Keypair.generate();
  const w = new Wallet(user);
  const mk = new Program<WickMarkets>(marketsIdl as WickMarkets, new AnchorProvider(conn, w, { commitment: "confirmed" }));
  const mkEr = new Program<WickMarkets>(marketsIdl as WickMarkets, new AnchorProvider(erConn, w, { commitment: "confirmed" }));
  const sl = new Program<Wick>(sealedIdl as Wick, new AnchorProvider(conn, w, { commitment: "confirmed" }));
  const faucet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(ROOT, "keys/faucet.json"), "utf8"))));
  const ata = getAssociatedTokenAddressSync(mint, user.publicKey);

  await send(conn, [SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: user.publicKey, lamports: 0.2 * LAMPORTS_PER_SOL })]);
  await send(conn, [
    createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, ata, user.publicKey, mint),
    createMintToInstruction(mint, ata, faucet.publicKey, 1_000_000_000n),
  ], [admin, faucet]);
  log("user funded", user.publicKey.toBase58());

  // 1. Pool: deposit + delegate, then trade on the ER.
  const position = PublicKey.findProgramAddressSync([Buffer.from("position"), market.toBuffer(), user.publicKey.toBuffer()], mk.programId)[0];
  const vault = PublicKey.findProgramAddressSync([Buffer.from("vault"), market.toBuffer()], mk.programId)[0];
  await send(conn, [
    await mk.methods.openPosition().accountsPartial({ owner: user.publicKey, market }).instruction(),
    await mk.methods.deposit(new BN(100_000_000)).accountsPartial({ owner: user.publicKey, position, vault, mint, ownerToken: ata }).instruction(),
    await mk.methods.delegatePosition().accountsPartial({ payer: user.publicKey, marketKey: market }).instruction(),
  ], [user]);
  log("deposited 100 + delegated; delegated =", (await conn.getAccountInfo(position))!.owner.equals(DELEGATION));
  for (let i = 0; i < 20 && !(await erConn.getAccountInfo(position)); i++) await sleep(500);

  const t0 = Date.now();
  await send(erConn, [await mkEr.methods.buy({ yes: {} }, new BN(40_000_000), new BN(0)).accountsPartial({ owner: user.publicKey, market, position }).instruction()], [user]);
  log(`ER buy YES 40 in ${Date.now() - t0}ms`);
  let pos = await mkEr.account.position.fetch(position);
  log("position", pos.balance.toNumber() / 1e6, "credit,", pos.yes.toNumber() / 1e6, "YES");
  await send(erConn, [await mkEr.methods.sell({ yes: {} }, new BN(Math.floor(pos.yes.toNumber() / 2)), new BN(0)).accountsPartial({ owner: user.publicKey, market, position }).instruction()], [user]);
  pos = await mkEr.account.position.fetch(position);
  const m = await mkEr.account.market.fetch(market);
  log("after sell:", pos.balance.toNumber() / 1e6, "credit,", pos.yes.toNumber() / 1e6, "YES; market YES =", (m.noReserve.toNumber() / (m.yesReserve.toNumber() + m.noReserve.toNumber())).toFixed(3));

  // 2. Touch ticket (base layer), priced off the Pyth push feed.
  const book = PublicKey.findProgramAddressSync([Buffer.from("touch_book"), market.toBuffer()], mk.programId)[0];
  const spot = m.strike.toNumber() / 1e8;
  await send(conn, [
    await mk.methods.buyTicket({ kind: { up: {} }, barrier: new BN(Math.round(spot * (1 + Number(process.env.TOUCH_PCT ?? 1) / 100) * 1e8)), barrier2: new BN(0), stake: new BN(5_000_000), maxPriceBps: 9_500 })
      .accountsPartial({ owner: user.publicKey, book, mint, ownerToken: ata, priceUpdate: new PublicKey(d.oracles.SOL.pythAccount) })
      .instruction(),
  ], [user]);
  const tickets = await mk.account.touchTicket.all([{ memcmp: { offset: 40, bytes: user.publicKey.toBase58() } }]);
  const t = tickets[0].account;
  log(`touch ↑ ${(t.barrier.toNumber() / 1e8).toFixed(2)} stake 5 → payout ${t.payout.toNumber() / 1e6} (price ${t.priceBps} bps)`);

  // 3. Sealed order via Arcium.
  const batch = PublicKey.findProgramAddressSync([Buffer.from("batch"), market.toBuffer()], sl.programId)[0];
  const mxeKey = await getMXEPublicKey(sl.provider as never, sl.programId);
  const priv = x25519.utils.randomSecretKey();
  const cipher = new RescueCipher(x25519.getSharedSecret(priv, mxeKey!));
  const nonce = randomBytes(16);
  const [sideCt, amtCt] = cipher.encrypt([1n, 15_000_000n], nonce);
  const offset = randomOffset();
  await sl.methods
    .placeOrder(offset, Array.from(sideCt), Array.from(amtCt), Array.from(x25519.getPublicKey(priv)), new BN(Buffer.from(nonce).reverse()), new BN(25_000_000))
    .accountsPartial({ payer: user.publicKey, batch, ownerToken: ata, ...arciumAccounts(offset, "place_order") })
    .rpc({ commitment: "confirmed" });
  const order = PublicKey.findProgramAddressSync([Buffer.from("order"), batch.toBuffer(), user.publicKey.toBuffer()], sl.programId)[0];
  for (let i = 0; i < 60; i++) {
    const o = await sl.account.sealedOrder.fetch(order);
    if ("placed" in o.state) {
      log(`sealed order placed after ~${i * 2}s (deposit 25, side/size encrypted)`);
      break;
    }
    await sleep(2000);
  }
  const b = await sl.account.sealedBatch.fetch(batch);
  log("batch orders", b.orderCount, "busy", b.busySince.toNumber(), "escrowed", b.escrowed.toNumber() / 1e6);
  fs.writeFileSync(path.join(ROOT, "keys/e2e-user.json"), JSON.stringify(Array.from(user.secretKey)));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
