// Perps smoke test with a fresh trader: deposit → delegate → 20x long SOL on the ER → close.
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

(async () => {
  const d = readDeployment();
  const mint = new PublicKey(d.mint);
  const user = Keypair.generate();
  const w = new Wallet(user);
  const mk = new Program<WickMarkets>(marketsIdl as WickMarkets, new AnchorProvider(conn, w, { commitment: "confirmed" }));
  const er = new Program<WickMarkets>(marketsIdl as WickMarkets, new AnchorProvider(erConn, w, { commitment: "confirmed" }));
  const faucet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(ROOT, "keys/faucet.json"), "utf8"))));
  const ata = getAssociatedTokenAddressSync(mint, user.publicKey);

  await send(conn, [SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: user.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })]);
  await send(conn, [
    createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, ata, user.publicKey, mint),
    createMintToInstruction(mint, ata, faucet.publicKey, BigInt(500 * USDC)),
  ], [admin, faucet]);

  const account = perpPda.account(user.publicKey);
  await send(conn, [
    await mk.methods.openPerpAccount().accountsPartial({ owner: user.publicKey }).instruction(),
    await mk.methods.perpDeposit(new BN(200 * USDC)).accountsPartial({ owner: user.publicKey, account, ownerToken: ata }).instruction(),
    await mk.methods.delegatePerpAccount().accountsPartial({ payer: user.publicKey }).instruction(),
  ], [user]);
  for (let i = 0; i < 20 && !(await erConn.getAccountInfo(account)); i++) await sleep(500);
  log("trader funded with 200 USDC credit, account on ER");

  const market = perpPda.market("SOL");
  const priceUpdate = new PublicKey(d.oracles.SOL.pythAccount);
  const accounts = { signer: user.publicKey, pool: perpPda.pool(), market, account, priceUpdate };

  let t0 = Date.now();
  await er.methods
    .openPerp({ long: {} }, new BN(50 * USDC), 200, new BN("100000000000000"))
    .accountsPartial(accounts)
    .rpc({ commitment: "confirmed" });
  const acc = await er.account.perpAccount.fetch(account);
  const s = acc.slots[0];
  log(
    `opened 20x long SOL in ${Date.now() - t0}ms: size $${s.size.toNumber() / USDC}, collateral $${s.collateral.toNumber() / USDC}, entry $${(s.entryPrice.toNumber() / 1e8).toFixed(3)}`,
  );
  const liq = (s.entryPrice.toNumber() / 1e8) * (1 - (s.collateral.toNumber() - s.size.toNumber() * 0.0006 - s.size.toNumber() * 0.005) / s.size.toNumber());
  log(`liquidation price ≈ $${liq.toFixed(3)} (needs BOTH oracles below it)`);

  await sleep(6000);
  t0 = Date.now();
  await er.methods.closePerp({ long: {} }, new BN(0), 10_000).accountsPartial(accounts).rpc({ commitment: "confirmed" });
  const after = await er.account.perpAccount.fetch(account);
  log(`closed in ${Date.now() - t0}ms: credit $${(after.credit.toNumber() / USDC).toFixed(4)} (started with $200)`);
  const pool = await er.account.perpPool.fetch(perpPda.pool());
  log(`pool liquidity $${(pool.liquidity.toNumber() / USDC).toFixed(2)}, reserved $${pool.reserved.toNumber() / USDC}, fees $${(pool.fees.toNumber() / USDC).toFixed(4)}`);
  fs.writeFileSync(path.join(ROOT, "keys/perps-user.json"), JSON.stringify(Array.from(user.secretKey)));
})().catch((e) => {
  console.error(String(e).slice(0, 600));
  process.exit(1);
});
