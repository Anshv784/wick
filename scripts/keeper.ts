/**
 * Wick keeper. Everything it does is permissionless on-chain; it just saves users the clicks.
 *   - pushes fresh Pyth and Switchboard prints for every asset
 *   - confirms touch tickets once both oracles print through the level
 *   - pulls expired markets and positions back from the ER, settles, voids stale freezes
 *   - reveals sealed batches at close and settles each sealed order after resolution
 *
 *   RPC_URL=... npx tsx scripts/keeper.ts
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
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
} from "./lib";
import { refreshAll } from "./oracles";
import { arciumAccounts, randomOffset } from "./setup";

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

async function settleMarkets() {
  for (const k of d.markets.map((s) => new PublicKey(s))) {
    const delegated = await isDelegated(k);
    const m = delegated
      ? await marketsEr.account.market.fetchNullable(k)
      : await markets.account.market.fetchNullable(k);
    if (!m) continue;
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

const REQUEUE_MS = 180_000;
const queuedAt = new Map<string, number>();

async function crankSealed() {
  // Size filters skip accounts left over from earlier program layouts.
  const batches = await sealed.account.sealedBatch.all([{ dataSize: sealed.account.sealedBatch.size }]);
  for (const { publicKey: batch, account: b } of batches) {
    const st = key(b.state);
    if (st === "open" && now() >= b.closeTs.toNumber() && b.busySince.toNumber() === 0) {
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

async function main() {
  log(`keeper up · ${d.markets.length} markets · house ${admin.publicKey.toBase58().slice(0, 6)}`);
  for (;;) {
    const t0 = Date.now();
    await refreshAll(ASSETS, hashes).catch((e) => log("oracle refresh error", String(e).slice(0, 160)));
    for (const [name, fn] of [
      ["touch", confirmTouches],
      ["settle", settleMarkets],
      ["sealed", crankSealed],
    ] as const) {
      await fn().catch((e) => log(`${name} loop error`, String(e).slice(0, 200)));
    }
    await sleep(Math.max(1_000, TICK_MS - (Date.now() - t0)));
  }
}

main();
