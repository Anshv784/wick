// Claims everything the last e2e user is owed: pool position, won touch tickets, sealed payout.
import { AnchorProvider, Program, Wallet } from "@anchor-lang/core";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import marketsIdl from "../target/idl/wick_markets.json";
import sealedIdl from "../target/idl/wick.json";
import type { WickMarkets } from "../target/types/wick_markets";
import type { Wick } from "../target/types/wick";
import { conn, log, readDeployment, ROOT } from "./lib";

(async () => {
  const d = readDeployment();
  const user = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(ROOT, "keys/e2e-user.json"), "utf8"))));
  const w = new Wallet(user);
  const mk = new Program<WickMarkets>(marketsIdl as WickMarkets, new AnchorProvider(conn, w, { commitment: "confirmed" }));
  const sl = new Program<Wick>(sealedIdl as Wick, new AnchorProvider(conn, w, { commitment: "confirmed" }));
  const mint = new PublicKey(d.mint);
  const ata = getAssociatedTokenAddressSync(mint, user.publicKey);
  const market = new PublicKey(d.markets[Number(process.env.MARKET_INDEX ?? 0)]);
  const bal = async () => Number((await conn.getTokenAccountBalance(ata)).value.amount) / 1e6;
  log("user", user.publicKey.toBase58().slice(0, 8), "wallet", await bal());

  const m = await mk.account.market.fetch(market);
  log("market", Object.keys(m.status)[0], m.outcome ? Object.keys(m.outcome)[0] : "", "pyth", m.settlePyth.toNumber() / 1e8, "sb", m.settleSb.toNumber() / 1e8);

  const position = PublicKey.findProgramAddressSync([Buffer.from("position"), market.toBuffer(), user.publicKey.toBuffer()], mk.programId)[0];
  const vault = PublicKey.findProgramAddressSync([Buffer.from("vault"), market.toBuffer()], mk.programId)[0];
  if (!(await mk.account.position.fetch(position)).claimed) {
    await mk.methods.claim().accountsPartial({ owner: user.publicKey, position, market, vault, mint, ownerToken: ata }).rpc();
    log("pool claimed → wallet", await bal());
  }

  const book = PublicKey.findProgramAddressSync([Buffer.from("touch_book"), market.toBuffer()], mk.programId)[0];
  const tickets = await mk.account.touchTicket.all([{ memcmp: { offset: 40, bytes: user.publicKey.toBase58() } }]);
  for (const t of tickets) {
    if (!("won" in t.account.status)) continue;
    await mk.methods.claimTicket().accountsPartial({ owner: user.publicKey, book, ticket: t.publicKey, mint, ownerToken: ata }).rpc();
    log(`touch ticket paid ${t.account.payout.toNumber() / 1e6} → wallet`, await bal());
  }

  const batch = PublicKey.findProgramAddressSync([Buffer.from("batch"), market.toBuffer()], sl.programId)[0];
  const order = PublicKey.findProgramAddressSync([Buffer.from("order"), batch.toBuffer(), user.publicKey.toBuffer()], sl.programId)[0];
  const o = await sl.account.sealedOrder.fetch(order);
  log("sealed order", Object.keys(o.state)[0], "payout", o.payout.toNumber() / 1e6);
  if ("settled" in o.state) {
    await sl.methods.withdrawPayout().accountsPartial({ owner: user.publicKey, batch, order, ownerToken: ata }).rpc();
    log("sealed payout withdrawn → wallet", await bal());
  }
})().catch((e) => {
  console.error(String(e).slice(0, 400));
  process.exit(1);
});
