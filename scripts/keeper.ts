/**
 * Wick keeper. Everything it does is permissionless on-chain; it just saves users the clicks.
 *   - pushes fresh Pyth and Switchboard prints for every asset
 *   - confirms touch tickets once both oracles print through the level
 *   - pulls expired markets and positions back from the ER, settles, voids stale freezes
 *   - reveals sealed batches at close and settles each sealed order after resolution
 *
 *   RPC_URL=... npx tsx scripts/keeper.ts
 */
import { createMintToInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import {
  arciumAccounts,
  randomOffset,
  ASSETS,
  conn,
  erConn,
  log,
  markets,
  marketsEr,
  readDeployment,
  send,
  sealed,
  sleep,
  admin,
  ROOT,
} from "./lib";
import { refresh } from "./oracles";
import { discoverMarkets, openMarket, PLAN } from "./markets";

const DELEGATION = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
const SETTLE_WINDOW = 120;
const TOUCH_GRACE = 600;
const VOID_DELAY = 86_400;
const TICK_MS = Number(process.env.TICK_MS ?? 8_000);

const d = readDeployment();
const hashes = Object.fromEntries(Object.entries(d.oracles).map(([s, o]) => [s, o.sbFeedHash]));
const now = () => Math.floor(Date.now() / 1000);
const key = (o: object) => Object.keys(o)[0];

/** Sends only if a simulation succeeds, so the keeper never pays for predictable failures. */
async function trySend(ixs: TransactionInstruction[], label: string, c = conn) {
  const { Transaction } = await import("@solana/web3.js");
  const tx = new Transaction().add(...ixs);
  tx.feePayer = admin.publicKey;
  tx.recentBlockhash = (await c.getLatestBlockhash()).blockhash;
  const sim = await c.simulateTransaction(tx);
  if (sim.value.err) return false;
  const sig = await send(c, ixs);
  log(label, sig.slice(0, 16));
  return true;
}

async function isDelegated(k: PublicKey) {
  const info = await conn.getAccountInfo(k);
  return !!info && info.owner.equals(DELEGATION);
}

async function confirmTouches() {
  const books = await markets.account.touchBook.all([{ dataSize: markets.account.touchBook.size }]);
  const tickets = await markets.account.touchTicket.all([{ dataSize: markets.account.touchTicket.size }]);
  for (const { publicKey: ticket, account: t } of tickets) {
    if (key(t.status) !== "open") continue;
    const book = books.find((b) => b.publicKey.equals(t.book));
    if (!book) continue;
    const symbol = ASSETS.find((a) => Buffer.from(a.pythFeedId, "hex").equals(Buffer.from(book.account.oracle.pythFeedId)))?.symbol;
    if (!symbol) continue;
    if (now() > book.account.expiry.toNumber() + TOUCH_GRACE) {
      const ix = await markets.methods.expireTicket().accountsPartial({ book: t.book, ticket }).instruction();
      await trySend([ix], `expired ticket ${ticket.toBase58().slice(0, 6)}`);
      continue;
    }
    const ix = await markets.methods
      .confirmTouch()
      .accountsPartial({
        book: t.book,
        ticket,
        priceUpdate: new PublicKey(d.oracles[symbol].pythAccount),
        sbFeed: new PublicKey(d.oracles[symbol].sbQuote),
      })
      .instruction();
    await trySend([ix], `touch confirmed ${ticket.toBase58().slice(0, 6)}`);
  }
}

/** Markets from deployment.json plus every sequential market of the house. */
async function allMarkets() {
  const keys = new Map(d.markets.map((s) => [s, new PublicKey(s)]));
  for (const m of await discoverMarkets(admin.publicKey)) keys.set(m.key.toBase58(), m.key);
  return [...keys.values()];
}

async function fetchAnyMarket(k: PublicKey) {
  const delegated = await isDelegated(k);
  const m = await (delegated ? marketsEr : markets).account.market.fetchNullable(k).catch(() => null);
  return m ? { m, delegated } : null;
}

/** Keeps the PLAN line-up live: a short SOL market and a 3-day market per asset. */
async function rollMarkets() {
  const live: { symbol: string; left: number }[] = [];
  for (const k of await allMarkets()) {
    const r = await fetchAnyMarket(k);
    if (!r || key(r.m.status) !== "open") continue;
    const left = r.m.expiry.toNumber() - now();
    if (left > 0) live.push({ symbol: Buffer.from(r.m.symbol).toString().replace(/\0/g, ""), left });
  }
  const used = new Set<number>();
  for (const slot of PLAN) {
    const short = slot.hours <= 12;
    // A short slot is covered by a market with 30m–12h left, a long slot by one with >12h left.
    const i = live.findIndex(
      (l, j) => !used.has(j) && l.symbol === slot.symbol && (short ? l.left > 1_800 && l.left <= 43_200 : l.left > 43_200),
    );
    if (i >= 0) {
      used.add(i);
      continue;
    }
    await openMarket(d, slot.symbol, slot.hours).catch((e) => log("open market failed", String(e).slice(0, 160)));
  }
}

/** Keeps the house stocked with test USDC so new markets and touch books can be funded. */
async function topUpHouse() {
  const mint = new PublicKey(d.mint);
  const ata = getAssociatedTokenAddressSync(mint, admin.publicKey);
  const bal = Number((await conn.getTokenAccountBalance(ata)).value.amount) / 1e6;
  if (bal >= 30_000) return;
  const faucet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(ROOT, "keys/faucet.json"), "utf8"))));
  await send(conn, [createMintToInstruction(mint, ata, faucet.publicKey, 100_000_000_000n)], [admin, faucet]);
  log("house topped up with 100k test USDC");
}

async function settleMarkets() {
  for (const k of await allMarkets()) {
    const r = await fetchAnyMarket(k);
    if (!r) continue;
    const { m, delegated } = r;
    const expiry = m.expiry.toNumber();
    const status = key(m.status);

    if (status === "open" && now() >= expiry) {
      if (delegated) {
        // Pull every position for this market back, then the market itself.
        const positions = await marketsEr.account.position.all([{ memcmp: { offset: 8 + 32, bytes: k.toBase58() } }]);
        for (const p of positions) {
          const ix = await marketsEr.methods
            .undelegatePosition()
            .accountsPartial({ payer: admin.publicKey, market: k, position: p.publicKey })
            .instruction();
          await trySend([ix], `undelegated position ${p.publicKey.toBase58().slice(0, 6)}`, erConn);
        }
        const ix = await marketsEr.methods.undelegateMarket().accountsPartial({ payer: admin.publicKey, market: k }).instruction();
        await trySend([ix], `undelegated market ${k.toBase58().slice(0, 6)}`, erConn);
        continue;
      }
      if (now() <= expiry + SETTLE_WINDOW) {
        const symbol = ASSETS.find((a) => Buffer.from(a.pythFeedId, "hex").equals(Buffer.from(m.oracle.pythFeedId)))!.symbol;
        const ix = await markets.methods
          .settleMarket()
          .accountsPartial({
            market: k,
            priceUpdate: new PublicKey(d.oracles[symbol].pythAccount),
            sbFeed: new PublicKey(d.oracles[symbol].sbQuote),
          })
          .instruction();
        await trySend([ix], `settled ${k.toBase58().slice(0, 6)}`);
      }
    }
    const voidFrom = status === "frozen" ? m.resolvedAt.toNumber() : status === "open" ? expiry : Infinity;
    if (now() >= voidFrom + VOID_DELAY) {
      const ix = await markets.methods.voidMarket().accountsPartial({ market: k }).instruction();
      await trySend([ix], `voided ${k.toBase58().slice(0, 6)}`);
    }
  }
}

const SIDES = [{ long: {} }, { short: {} }] as const;

/**
 * Perp liquidations on the ER. The program only liquidates when BOTH oracles put the position
 * under maintenance, so each candidate is simulated first and sent only if that check passes.
 */
async function liquidatePerps() {
  const accounts = await marketsEr.account.perpAccount.all([{ dataSize: marketsEr.account.perpAccount.size }]);
  for (const { publicKey: account, account: a } of accounts) {
    for (const [i, slot] of a.slots.entries()) {
      if (slot.size.isZero()) continue;
      const asset = ASSETS[Math.floor(i / 2)];
      if (!asset) continue;
      const market = PublicKey.findProgramAddressSync(
        [Buffer.from("perp_market"), Buffer.concat([Buffer.from(asset.symbol), Buffer.alloc(16)]).subarray(0, 16)],
        markets.programId,
      )[0];
      const ix = await marketsEr.methods
        .liquidatePerp(SIDES[i % 2])
        .accountsPartial({
          keeper: admin.publicKey,
          market,
          account,
          priceUpdate: new PublicKey(d.oracles[asset.symbol].pythAccount),
          sbFeed: new PublicKey(d.oracles[asset.symbol].sbQuote),
        })
        .instruction();
      await trySend([ix], `liquidated ${asset.symbol} ${i % 2 ? "short" : "long"} of ${a.owner.toBase58().slice(0, 6)}`, erConn);
    }
  }
}

/** Fills perp limit / TP / SL orders whose trigger the pinned Pyth price has crossed. */
async function executePerpOrders() {
  const books = await marketsEr.account.perpOrders.all([{ dataSize: marketsEr.account.perpOrders.size }]);
  for (const { publicKey: orders, account: b } of books) {
    const account = PublicKey.findProgramAddressSync([Buffer.from("perp_account"), b.owner.toBuffer()], markets.programId)[0];
    for (const [i, o] of b.orders.entries()) {
      if ("none" in (o.kind as object)) continue;
      const asset = ASSETS[o.marketIndex];
      if (!asset) continue;
      const market = PublicKey.findProgramAddressSync(
        [Buffer.from("perp_market"), Buffer.concat([Buffer.from(asset.symbol), Buffer.alloc(16)]).subarray(0, 16)],
        markets.programId,
      )[0];
      const ix = await marketsEr.methods
        .executePerpOrder(i)
        .accountsPartial({ keeper: admin.publicKey, market, account, orders, priceUpdate: new PublicKey(d.oracles[asset.symbol].pythAccount) })
        .instruction();
      await trySend([ix], `filled ${Object.keys(o.kind)[0]} ${asset.symbol} ${o.isLong ? "long" : "short"} for ${b.owner.toBase58().slice(0, 6)}`, erConn);
    }
  }
}

/** Fills prediction limit orders when the pool reaches their price; clears them after expiry. */
async function executePoolOrders() {
  const books = await marketsEr.account.poolOrders.all([{ dataSize: marketsEr.account.poolOrders.size }]);
  for (const { publicKey: orders, account: b } of books) {
    const position = PublicKey.findProgramAddressSync([Buffer.from("position"), b.market.toBuffer(), b.owner.toBuffer()], markets.programId)[0];
    const m = await marketsEr.account.market.fetchNullable(b.market).catch(() => null);
    if (!m) continue;
    const expired = now() >= m.expiry.toNumber();
    for (const [i, o] of b.orders.entries()) {
      if (!o.active) continue;
      const ix = expired
        ? await marketsEr.methods.cancelPoolOrder(i).accountsPartial({ signer: admin.publicKey, market: b.market, position, orders, session: null }).instruction()
        : await marketsEr.methods.executePoolOrder(i).accountsPartial({ keeper: admin.publicKey, market: b.market, position, orders }).instruction();
      await trySend([ix], `${expired ? "cleared" : "filled"} limit ${o.isBuy ? "buy" : "sell"} ${o.isYes ? "YES" : "NO"} for ${b.owner.toBase58().slice(0, 6)}`, erConn);
    }
  }
}

const STOP_CHECK_MS = 30_000;
const stopCheckedAt = new Map<string, number>();

/**
 * Hidden stop-losses: every armed stop is checked in MPC against the pinned Pyth price every
 * ~30s. Triggered stops are closed on the ER; the stop price itself is never revealed.
 */
async function crankStops() {
  const stops = await sealed.account.stopOrder.all([{ dataSize: sealed.account.stopOrder.size }]);
  for (const { publicKey: stop, account: st } of stops) {
    const symbol = Buffer.from(st.symbol).toString().replace(/\0/g, "");
    const asset = ASSETS.find((a) => a.symbol === symbol);
    if (!asset || !st.armed) continue;
    const perpMarket = PublicKey.findProgramAddressSync(
      [Buffer.from("perp_market"), Buffer.from(st.symbol)],
      markets.programId,
    )[0];
    if (st.triggered) {
      const account = PublicKey.findProgramAddressSync([Buffer.from("perp_account"), st.owner.toBuffer()], markets.programId)[0];
      const ix = await marketsEr.methods
        .closeByStop(st.isLong ? { long: {} } : { short: {} })
        .accountsPartial({
          keeper: admin.publicKey,
          market: perpMarket,
          account,
          priceUpdate: new PublicKey(d.oracles[symbol].pythAccount),
          stop,
        })
        .instruction();
      await trySend([ix], `stop hit: closed ${symbol} ${st.isLong ? "long" : "short"} of ${st.owner.toBase58().slice(0, 6)}`, erConn);
      continue;
    }
    const last = stopCheckedAt.get(stop.toBase58()) ?? 0;
    if (Date.now() - last < STOP_CHECK_MS) continue;
    stopCheckedAt.set(stop.toBase58(), Date.now());
    const offset = randomOffset();
    await sealed.methods
      .checkStop(offset)
      .accountsPartial({
        payer: admin.publicKey,
        stop,
        perpMarket,
        priceUpdate: new PublicKey(d.oracles[symbol].pythAccount),
        ...arciumAccounts(offset, "check_stop"),
      })
      .rpc({ commitment: "confirmed" })
      .catch((e) => log("stop check failed", String(e).slice(0, 120)));
  }
}

const REQUEUE_MS = 180_000;
const queuedAt = new Map<string, number>();

async function crankSealed() {
  // Size filters skip accounts left over from earlier program layouts.
  const batches = await sealed.account.sealedBatch.all([{ dataSize: sealed.account.sealedBatch.size }]);
  for (const { publicKey: batch, account: b } of batches) {
    const st = key(b.state);
    const lockExpired = now() > b.busySince.toNumber() + 60;
    if (st === "initializing" && lockExpired) {
      const offset = randomOffset();
      await sealed.methods
        .retryInitBatch(offset)
        .accountsPartial({ payer: admin.publicKey, batch, ...arciumAccounts(offset, "init_totals") })
        .rpc({ commitment: "confirmed" })
        .then(() => log(`init retried ${batch.toBase58().slice(0, 6)}`))
        .catch((e) => log("init retry failed", String(e).slice(0, 120)));
    }
    if (
      (st === "open" && now() >= b.closeTs.toNumber() && (b.busySince.toNumber() === 0 || lockExpired)) ||
      (st === "revealing" && lockExpired)
    ) {
      const offset = randomOffset();
      try {
        await sealed.methods
          .revealBatch(offset)
          .accountsPartial({ payer: admin.publicKey, batch, ...arciumAccounts(offset, "reveal_totals") })
          .rpc({ commitment: "confirmed" });
        log(`reveal queued ${batch.toBase58().slice(0, 6)}`);
      } catch (e) {
        log("reveal failed", String(e).slice(0, 120));
      }
    }
    if (st !== "revealed") continue;
    const market = await markets.account.market.fetchNullable(b.market);
    if (!market || key(market.status) === "open" || key(market.status) === "frozen") continue;
    const orders = await sealed.account.sealedOrder.all([{ memcmp: { offset: 8 + 64 + 16, bytes: batch.toBase58() } }]);
    for (const o of orders) {
      // "settling" orders are re-queued: a computation that never called back must not strand funds.
      if (!["placed", "settling"].includes(key(o.account.state))) continue;
      const last = queuedAt.get(o.publicKey.toBase58()) ?? 0;
      if (Date.now() - last < REQUEUE_MS) continue;
      queuedAt.set(o.publicKey.toBase58(), Date.now());
      const offset = randomOffset();
      try {
        await sealed.methods
          .settleOrder(offset)
          .accountsPartial({
            payer: admin.publicKey,
            batch,
            order: o.publicKey,
            market: b.market,
            ...arciumAccounts(offset, "reveal_order"),
          })
          .rpc({ commitment: "confirmed" });
        log(`sealed order settling ${o.publicKey.toBase58().slice(0, 6)}`);
      } catch (e) {
        log("settle order failed", String(e).slice(0, 120));
      }
    }
  }
}

// RPC and oracle endpoints drop connections now and then; a stray rejection must never
// take the keeper down, so log it and let the next tick retry.
process.on("unhandledRejection", (e) => log("unhandled", String(e).slice(0, 160)));
process.on("uncaughtException", (e) => log("uncaught", String(e).slice(0, 160)));

let tick = 0;

const symbolOf = (feedId: number[]) =>
  ASSETS.find((a) => Buffer.from(a.pythFeedId, "hex").equals(Buffer.from(feedId)))?.symbol;

/** Assets with an open touch ticket or a market within 5 minutes of expiry (or awaiting settlement). */
async function hotAssets() {
  const hot = new Set<string>();
  const books = await markets.account.touchBook.all([{ dataSize: markets.account.touchBook.size }]);
  const tickets = await markets.account.touchTicket.all([{ dataSize: markets.account.touchTicket.size }]);
  for (const t of tickets) {
    if (key(t.account.status) !== "open") continue;
    const b = books.find((x) => x.publicKey.equals(t.account.book));
    if (b && now() <= b.account.expiry.toNumber() + TOUCH_GRACE) hot.add(symbolOf(b.account.oracle.pythFeedId) ?? "");
  }
  for (const b of books) {
    const dt = b.account.expiry.toNumber() - now();
    if (dt < 300 && dt > -SETTLE_WINDOW) hot.add(symbolOf(b.account.oracle.pythFeedId) ?? "");
  }
  hot.delete("");
  return hot;
}

const ORACLE_MS = 6_000;

/**
 * Oracle cranks run on their own clock so slow settlement work never lets feeds go stale.
 * Pyth every 6s keeps ticket quotes inside their 20s bound; Switchboard (only needed for
 * quotes, touch confirmation and settlement) every 6s for hot assets and every ~24s otherwise.
 */
async function oracleLoop() {
  let n = 0;
  let hot = new Set<string>();
  for (;;) {
    const t0 = Date.now();
    if (n % 5 === 0) hot = await hotAssets().catch(() => hot);
    const sbFor = ASSETS.filter((a) => hot.has(a.symbol) || n % 4 === 0);
    await refresh(ASSETS, hashes, true, sbFor).catch((e) => log("oracle refresh error", String(e).slice(0, 160)));
    n++;
    await sleep(Math.max(500, ORACLE_MS - (Date.now() - t0)));
  }
}

async function main() {
  log(`keeper up · house ${admin.publicKey.toBase58().slice(0, 6)}`);
  void oracleLoop();
  for (;;) {
    const t0 = Date.now();
    tick++;
    const jobs: [string, () => Promise<unknown>][] = [
      ["pool orders", executePoolOrders],
      ["touch", confirmTouches],
      ["settle", settleMarkets],
      ["sealed", crankSealed],
      ["perps", liquidatePerps],
      ["stops", crankStops],
      ["perp orders", executePerpOrders],
    ];
    // Market roll-over and house top-up are slow checks; run them every ~5 minutes.
    if (tick % 40 === 1) jobs.push(["roll", rollMarkets], ["topup", topUpHouse]);
    for (const [name, fn] of jobs) {
      await fn().catch((e) => log(`${name} loop error`, String(e).slice(0, 200)));
    }
    await sleep(Math.max(1_000, TICK_MS - (Date.now() - t0)));
  }
}

main();
