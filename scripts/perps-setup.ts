/**
 * One-time perps bootstrap: pool + SOL/BTC/ETH markets, house LP seed, delegation to the ER.
 *   yarn perps-setup
 */
import { BN } from "@anchor-lang/core";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { admin, ASSETS, conn, erConn, log, markets, marketsEr, readDeployment, sleep, writeDeployment } from "./lib";

const USDC = 1_000_000;
const DELEGATION = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
const LP_SEED = 50_000 * USDC;

export const perpPda = {
  pool: () => PublicKey.findProgramAddressSync([Buffer.from("perp_pool")], markets.programId)[0],
  vault: () => PublicKey.findProgramAddressSync([Buffer.from("perp_vault")], markets.programId)[0],
  market: (symbol: string) =>
    PublicKey.findProgramAddressSync([Buffer.from("perp_market"), symbolBytes(symbol)], markets.programId)[0],
  account: (owner: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("perp_account"), owner.toBuffer()], markets.programId)[0],
};

export function symbolBytes(s: string) {
  return Buffer.concat([Buffer.from(s), Buffer.alloc(16)]).subarray(0, 16);
}

const delegated = async (k: PublicKey) => (await conn.getAccountInfo(k))?.owner.equals(DELEGATION) ?? false;

async function main() {
  const d = readDeployment();
  const mint = new PublicKey(d.mint);
  const pool = perpPda.pool();

  if (!(await conn.getAccountInfo(pool))) {
    await markets.methods.initPerpPool().accountsPartial({ admin: admin.publicKey, mint }).rpc({ commitment: "confirmed" });
    log("perp pool", pool.toBase58());
  }

  for (const [index, a] of ASSETS.entries()) {
    const key = perpPda.market(a.symbol);
    if (await conn.getAccountInfo(key)) continue;
    await markets.methods
      .initPerpMarket({
        symbol: Array.from(symbolBytes(a.symbol)),
        index,
        oracle: {
          pythFeedId: Array.from(Buffer.from(a.pythFeedId, "hex")),
          pythAccount: new PublicKey(d.oracles[a.symbol].pythAccount),
          sbFeed: new PublicKey(d.oracles[a.symbol].sbQuote),
          maxDevBps: 50,
        },
        maxLeverage: 50,
        openFeeBps: 6,
        closeFeeBps: 6,
        maintBps: 50,
        liqFeeBps: 20,
        borrowPpmPerHour: 100,
        maxOi: new BN(250_000 * USDC),
      })
      .accountsPartial({ admin: admin.publicKey, pool, market: key })
      .rpc({ commitment: "confirmed" });
    log(`perp market ${a.symbol}`, key.toBase58());
  }

  // House account: deposit the LP seed on base, then move everything to the ER.
  const account = perpPda.account(admin.publicKey);
  if (!(await conn.getAccountInfo(account))) {
    await markets.methods.openPerpAccount().accountsPartial({ owner: admin.publicKey }).rpc({ commitment: "confirmed" });
  }
  if (!(await delegated(account))) {
    const acc = await markets.account.perpAccount.fetch(account);
    if (acc.credit.toNumber() + acc.lpShares.toNumber() < LP_SEED) {
      await markets.methods
        .perpDeposit(new BN(LP_SEED))
        .accountsPartial({ owner: admin.publicKey, account, ownerToken: getAssociatedTokenAddressSync(mint, admin.publicKey) })
        .rpc({ commitment: "confirmed" });
      log("house deposited", LP_SEED / USDC);
    }
    await markets.methods.delegatePerpAccount().accountsPartial({ payer: admin.publicKey }).rpc({ commitment: "confirmed" });
  }
  if (!(await delegated(pool))) {
    await markets.methods.delegatePerpPool().accountsPartial({ payer: admin.publicKey }).rpc({ commitment: "confirmed" });
  }
  for (const a of ASSETS) {
    if (!(await delegated(perpPda.market(a.symbol)))) {
      await markets.methods
        .delegatePerpMarket(Array.from(symbolBytes(a.symbol)))
        .accountsPartial({ payer: admin.publicKey, market: perpPda.market(a.symbol) })
        .rpc({ commitment: "confirmed" });
    }
  }
  log("delegated pool, markets and house account");

  for (let i = 0; i < 30 && !(await erConn.getAccountInfo(pool)); i++) await sleep(1000);
  const poolEr = await marketsEr.account.perpPool.fetch(pool);
  const accEr = await marketsEr.account.perpAccount.fetch(account);
  if (accEr.credit.toNumber() > 0) {
    await marketsEr.methods.lpDeposit(accEr.credit).accountsPartial({ signer: admin.publicKey, pool, account }).rpc({ commitment: "confirmed" });
    log("house LP deposit on ER", accEr.credit.toNumber() / USDC);
  }
  const after = await marketsEr.account.perpPool.fetch(pool);
  log("pool liquidity", after.liquidity.toNumber() / USDC, "shares", after.shares.toNumber(), "(was", poolEr.liquidity.toNumber() / USDC, ")");

  (d as unknown as { perps: object }).perps = {
    pool: pool.toBase58(),
    vault: perpPda.vault().toBase58(),
    markets: Object.fromEntries(ASSETS.map((a) => [a.symbol, perpPda.market(a.symbol).toBase58()])),
  };
  writeDeployment(d);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
