// Opening and discovering markets. Markets use sequential ids per house (1, 2, 3, …) so the
// app and the keeper can find every market by probing PDAs, with no registry to maintain.
import { BN } from "@anchor-lang/core";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { admin, arciumAccounts, ASSETS, conn, Deployment, log, markets, randomOffset, sealed } from "./lib";
import { hermes } from "./oracles";

export type Symbol = "SOL" | "BTC" | "ETH";

const USDC = 1_000_000;
const STEP: Record<Symbol, number> = { SOL: 1, BTC: 500, ETH: 25 };
const VOL: Record<Symbol, number> = { SOL: 7_000, BTC: 4_500, ETH: 5_500 };

/** The standing line-up the keeper keeps live: a short SOL market and a 3-day market per asset. */
export const PLAN: { symbol: Symbol; hours: number }[] = [
  { symbol: "SOL", hours: 6 },
  { symbol: "SOL", hours: 72 },
  { symbol: "BTC", hours: 72 },
  { symbol: "ETH", hours: 72 },
];

export function marketPda(house: PublicKey, id: number) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), house.toBuffer(), new BN(id).toArrayLike(Buffer, "le", 8)],
    markets.programId,
  )[0];
}

/** Every sequential market of `house` that exists (delegated or not). */
export async function discoverMarkets(house: PublicKey) {
  const found: { id: number; key: PublicKey }[] = [];
  for (let start = 1; ; start += 50) {
    const keys = Array.from({ length: 50 }, (_, i) => marketPda(house, start + i));
    const infos = await conn.getMultipleAccountsInfo(keys);
    infos.forEach((info, i) => info && found.push({ id: start + i, key: keys[i] }));
    if (infos.every((i) => !i)) return found;
  }
}

async function nextId(house: PublicKey) {
  const all = await discoverMarkets(house);
  return all.length ? Math.max(...all.map((m) => m.id)) + 1 : 1;
}

/** Creates a market at spot (rounded), its touch book and sealed batch, then delegates it to the ER. */
export async function openMarket(d: Deployment, symbol: Symbol, hours: number) {
  const a = ASSETS.find((x) => x.symbol === symbol)!;
  const mint = new PublicKey(d.mint);
  const creatorToken = (await getOrCreateAssociatedTokenAccount(conn, admin, mint, admin.publicKey)).address;
  const upd = await hermes.getLatestPriceUpdates([a.pythFeedId]);
  const px = upd.parsed![0].price;
  const spot = Number(px.price) * 10 ** px.expo;
  const strike = Math.round(spot / STEP[symbol]) * STEP[symbol];
  const expiry = Math.floor(Date.now() / 1000 + hours * 3600);
  const id = await nextId(admin.publicKey);
  const market = marketPda(admin.publicKey, id);

  await markets.methods
    .createMarket({
      marketId: new BN(id),
      symbol: Array.from(Buffer.concat([Buffer.from(symbol), Buffer.alloc(16)]).subarray(0, 16)),
      oracle: {
        pythFeedId: Array.from(Buffer.from(a.pythFeedId, "hex")),
        pythAccount: new PublicKey(d.oracles[symbol].pythAccount),
        sbFeed: new PublicKey(d.oracles[symbol].sbQuote),
        maxDevBps: 50,
      },
      strike: new BN(Math.round(strike * 1e8)),
      expiry: new BN(expiry),
      feeBps: 100,
      liquidity: new BN(500 * USDC),
    })
    .accountsPartial({ creator: admin.publicKey, market, mint, creatorToken })
    .rpc({ commitment: "confirmed" });

  await markets.methods
    .createTouchBook({
      volBps: VOL[symbol],
      marginBps: 800,
      maxPayout: new BN(1_000 * USDC),
      funding: new BN(5_000 * USDC),
    })
    .accountsPartial({ house: admin.publicKey, market, mint, houseToken: creatorToken })
    .rpc({ commitment: "confirmed" });

  const offset = randomOffset();
  await sealed.methods
    .createBatch(offset, new BN(Math.floor(expiry - Math.min(3600, (hours * 3600) / 4))))
    .accountsPartial({ payer: admin.publicKey, market, mint, ...arciumAccounts(offset, "init_totals") })
    .rpc({ commitment: "confirmed" })
    .catch((e) => log("sealed batch skipped:", String(e).slice(0, 200)));

  await markets.methods.delegateMarket(new BN(id)).accountsPartial({ payer: admin.publicKey }).rpc({ commitment: "confirmed" });
  log(`opened #${id} ${symbol} ≥ ${strike} for ${hours}h →`, market.toBase58());
  return market;
}
