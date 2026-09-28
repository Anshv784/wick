// Session keys + perps (partial close, margin, TP, limit) + prediction limit orders, on devnet.
// Every ER transaction here is signed by a zero-SOL session key, never by the wallet.
import { AnchorProvider, BN, Program, Wallet } from "@anchor-lang/core";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import marketsIdl from "../target/idl/wick_markets.json";
import type { WickMarkets } from "../target/types/wick_markets";
import { admin, conn, erConn, log, readDeployment, ROOT, send, sleep } from "./lib";
import { perpPda } from "./perps-setup";

const USDC = 1_000_000;
const until = async (f: () => Promise<boolean>, what: string, secs = 90) => {
  for (let i = 0; i < secs / 3; i++) {
    if (await f()) return;
    await sleep(3000);
  }
  throw new Error(`timed out waiting for ${what}`);
};

(async () => {
  const d = readDeployment();
  const mint = new PublicKey(d.mint);
  const user = Keypair.generate();
  const sessionKey = Keypair.generate(); // lives in the browser; never funded
  const base = new Program<WickMarkets>(marketsIdl as WickMarkets, new AnchorProvider(conn, new Wallet(user), { commitment: "confirmed" }));
  const er = new Program<WickMarkets>(marketsIdl as WickMarkets, new AnchorProvider(erConn, new Wallet(sessionKey), { commitment: "confirmed" }));
  const faucet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(ROOT, "keys/faucet.json"), "utf8"))));
  const ata = getAssociatedTokenAddressSync(mint, user.publicKey);
  await send(conn, [SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: user.publicKey, lamports: 0.08 * LAMPORTS_PER_SOL })]);
  await send(conn, [
    createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, ata, user.publicKey, mint),
    createMintToInstruction(mint, ata, faucet.publicKey, BigInt(500 * USDC)),
  ], [admin, faucet]);

  // One wallet signature: accounts, deposit, session key, delegation.
  const account = perpPda.account(user.publicKey);
  const session = PublicKey.findProgramAddressSync([Buffer.from("session"), user.publicKey.toBuffer()], base.programId)[0];
  await send(conn, [
    await base.methods.openPerpAccount().accountsPartial({ owner: user.publicKey }).instruction(),
    await base.methods.openPerpOrders().accountsPartial({ owner: user.publicKey }).instruction(),
    await base.methods.perpDeposit(new BN(200 * USDC)).accountsPartial({ owner: user.publicKey, account, ownerToken: ata }).instruction(),
    await base.methods.setSession(sessionKey.publicKey, new BN(Math.floor(Date.now() / 1000) + 86_400)).accountsPartial({ owner: user.publicKey }).instruction(),
    await base.methods.delegatePerpAccount().accountsPartial({ payer: user.publicKey }).instruction(),
    await base.methods.delegatePerpOrders().accountsPartial({ payer: user.publicKey }).instruction(),
  ], [user]);
  const orders = PublicKey.findProgramAddressSync([Buffer.from("perp_orders"), user.publicKey.toBuffer()], base.programId)[0];
  await until(async () => !!(await erConn.getAccountInfo(account)) && !!(await erConn.getAccountInfo(orders)), "delegation");
  log("one wallet signature: deposit + session key + delegation");

  const market = perpPda.market("SOL");
  const priceUpdate = new PublicKey(d.oracles.SOL.pythAccount);
  const trade = { signer: sessionKey.publicKey, pool: perpPda.pool(), market, account, priceUpdate, session };
  const slot0 = async () => (await er.account.perpAccount.fetch(account)).slots[0];

  await er.methods.openPerp({ long: {} }, new BN(40 * USDC), 100, new BN("100000000000000")).accountsPartial(trade).rpc({ commitment: "confirmed" });
  let s = await slot0();
  log(`session key opened 10x long: size $${s.size.toNumber() / USDC}, collateral $${s.collateral.toNumber() / USDC}`);

  await er.methods.closePerp({ long: {} }, new BN(0), 5_000).accountsPartial(trade).rpc({ commitment: "confirmed" });
  s = await slot0();
  log(`closed 50%: size now $${s.size.toNumber() / USDC}, collateral $${(s.collateral.toNumber() / USDC).toFixed(3)}`);

  await er.methods.adjustMargin({ long: {} }, true, new BN(10 * USDC)).accountsPartial(trade).rpc({ commitment: "confirmed" });
  s = await slot0();
  log(`added $10 margin: collateral $${(s.collateral.toNumber() / USDC).toFixed(3)}`);

  const px = s.entryPrice.toNumber();
  const manage = { signer: sessionKey.publicKey, account, orders, session };
  // TP just under the current price: already crossed, so the keeper should close the leg.
  await er.methods
    .placePerpOrder({ takeProfit: {} }, 0, true, new BN(Math.round(px * 0.995)), new BN(0), 0)
    .accountsPartial(manage)
    .rpc({ commitment: "confirmed" });
  log("take-profit placed; waiting for keeper…");
  await until(async () => (await slot0()).size.isZero(), "take-profit fill");
  log("✓ keeper filled the take-profit, position closed");

  // Limit long above the current price: already satisfied, so it should open.
  await er.methods
    .placePerpOrder({ limitOpen: {} }, 0, true, new BN(Math.round(px * 1.02)), new BN(20 * USDC), 50)
    .accountsPartial(manage)
    .rpc({ commitment: "confirmed" });
  log("limit long placed (collateral escrowed); waiting for keeper…");
  await until(async () => !(await slot0()).size.isZero(), "limit fill");
  s = await slot0();
  log(`✓ keeper filled the limit: 5x long, size $${s.size.toNumber() / USDC}`);
  await er.methods.closePerp({ long: {} }, new BN(0), 10_000).accountsPartial(trade).rpc({ commitment: "confirmed" });

  // Prediction market limit order.
  const pm = new PublicKey(d.markets[1]);
  const position = PublicKey.findProgramAddressSync([Buffer.from("position"), pm.toBuffer(), user.publicKey.toBuffer()], base.programId)[0];
  const poolOrders = PublicKey.findProgramAddressSync([Buffer.from("pool_orders"), pm.toBuffer(), user.publicKey.toBuffer()], base.programId)[0];
  const vault = PublicKey.findProgramAddressSync([Buffer.from("vault"), pm.toBuffer()], base.programId)[0];
  await send(conn, [
    await base.methods.openPosition().accountsPartial({ owner: user.publicKey, market: pm }).instruction(),
    await base.methods.openPoolOrders().accountsPartial({ owner: user.publicKey, market: pm }).instruction(),
    await base.methods.deposit(new BN(50 * USDC)).accountsPartial({ owner: user.publicKey, position, vault, mint, ownerToken: ata }).instruction(),
    await base.methods.delegatePosition().accountsPartial({ payer: user.publicKey, marketKey: pm }).instruction(),
    await base.methods.delegatePoolOrders().accountsPartial({ payer: user.publicKey, marketKey: pm }).instruction(),
  ], [user]);
  await until(async () => !!(await erConn.getAccountInfo(position)) && !!(await erConn.getAccountInfo(poolOrders)), "position delegation");
  await er.methods
    .placePoolOrder(true, true, new BN(20 * USDC), 9_000)
    .accountsPartial({ signer: sessionKey.publicKey, market: pm, position, orders: poolOrders, session })
    .rpc({ commitment: "confirmed" });
  log("limit buy YES ≤ 90¢ placed (USDC escrowed); waiting for keeper…");
  await until(async () => (await er.account.position.fetch(position)).yes.toNumber() > 0, "pool limit fill");
  const p = await er.account.position.fetch(position);
  log(`✓ keeper filled it: ${(p.yes.toNumber() / USDC).toFixed(3)} YES, credit $${(p.balance.toNumber() / USDC).toFixed(2)}`);
})().catch((e) => {
  console.error(String(e).slice(0, 800));
  process.exit(1);
});
