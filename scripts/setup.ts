/**
 * One-time devnet bootstrap (idempotent where it can be):
 *   test USDC mint → oracle accounts → Arcium comp defs → markets + touch books + sealed batches.
 *
 *   RPC_URL=... npx tsx scripts/setup.ts [--markets]
 */
import { BN } from "@anchor-lang/core";
import {
  getArciumAccountBaseSeed,
  getArciumProgram,
  getArciumProgramId,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getComputationAccAddress,
  getExecutingPoolAccAddress,
  getLookupTableAddress,
  getMempoolAccAddress,
  getMXEAccAddress,
  getRawCircuitAccAddress,
  uploadCircuit,
} from "@arcium-hq/client";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import {
  admin,
  ARCIUM_CLUSTER_OFFSET,
  ASSETS,
  conn,
  Deployment,
  log,
  markets,
  readDeployment,
  ROOT,
  sealed,
  writeDeployment,
} from "./lib";
import { hermes, pushPyth, pushSwitchboard, pythAccount, sbFeedHash, sbQuoteAccount } from "./oracles";

const KEYS = path.join(ROOT, "keys");
const USDC = 1_000_000;

function keypairFile(name: string) {
  const p = path.join(KEYS, `${name}.json`);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(KEYS, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(Array.from(Keypair.generate().secretKey)));
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
}

async function ensureMint(d: Deployment) {
  const faucet = keypairFile("faucet");
  if (!d.mint) {
    const mint = await createMint(conn, admin, faucet.publicKey, null, 6);
    d.mint = mint.toBase58();
    log("mint", d.mint);
  }
  const ata = await getOrCreateAssociatedTokenAccount(conn, admin, new PublicKey(d.mint), admin.publicKey);
  if (Number(ata.amount) < 50_000 * USDC) {
    await mintTo(conn, admin, new PublicKey(d.mint), ata.address, faucet, 100_000 * USDC);
    log("minted 100k test USDC to house");
  }
  d.house = admin.publicKey.toBase58();
}

async function ensureOracles(d: Deployment) {
  d.oracles ??= {};
  await pushPyth(ASSETS);
  for (const a of ASSETS) {
    const hash = d.oracles[a.symbol]?.sbFeedHash ?? (await sbFeedHash(a));
    await pushSwitchboard(hash);
    d.oracles[a.symbol] = {
      pythAccount: pythAccount(a.pythFeedId).toBase58(),
      sbQuote: (await sbQuoteAccount(hash)).toBase58(),
      sbFeedHash: hash,
    };
    log(a.symbol, d.oracles[a.symbol]);
  }
}

const CIRCUITS = ["init_totals", "place_order", "reveal_totals", "reveal_order"] as const;

async function ensureCompDefs() {
  const arcium = getArciumProgram(sealed.provider as never);
  const mxeAccount = getMXEAccAddress(sealed.programId);
  const mxe = await arcium.account.mxeAccount.fetch(mxeAccount);
  const lut = getLookupTableAddress(sealed.programId, mxe.lutOffsetSlot);
  for (const name of CIRCUITS) {
    const compDef = PublicKey.findProgramAddressSync(
      [getArciumAccountBaseSeed("ComputationDefinitionAccount"), sealed.programId.toBuffer(), getCompDefAccOffset(name)],
      getArciumProgramId(),
    )[0];
    if (!(await conn.getAccountInfo(compDef))) {
      const method = {
        init_totals: "initInitTotalsCompDef",
        place_order: "initPlaceOrderCompDef",
        reveal_totals: "initRevealTotalsCompDef",
        reveal_order: "initRevealOrderCompDef",
      }[name] as "initInitTotalsCompDef";
      await sealed.methods[method]()
        .accountsPartial({ compDefAccount: compDef, payer: admin.publicKey, mxeAccount, addressLookupTable: lut })
        .rpc({ commitment: "confirmed" });
      log("comp def", name);
    }
    await uploadCircuit(
      sealed.provider as never,
      name,
      sealed.programId,
      fs.readFileSync(path.join(ROOT, `build/${name}.arcis`)),
      true,
      Number(process.env.UPLOAD_CHUNK ?? 40),
      { skipPreflight: true, preflightCommitment: "confirmed", commitment: "confirmed" },
    );
    // uploadCircuit skips accounts that already have the right size, so a rate-limited
    // upload can leave a truncated circuit behind. Verify the bytes before trusting it.
    const raw = await conn.getAccountInfo(getRawCircuitAccAddress(compDef, 0));
    const local = fs.readFileSync(path.join(ROOT, `build/${name}.arcis`));
    if (!raw || !raw.data.subarray(9, 9 + local.length).equals(local)) {
      throw new Error(`circuit ${name} on-chain bytes do not match build/${name}.arcis`);
    }
    log("circuit verified", name);
  }
}

export function arciumAccounts(offset: BN, circuit: string) {
  return {
    mxeAccount: getMXEAccAddress(sealed.programId),
    mempoolAccount: getMempoolAccAddress(ARCIUM_CLUSTER_OFFSET),
    executingPool: getExecutingPoolAccAddress(ARCIUM_CLUSTER_OFFSET),
    computationAccount: getComputationAccAddress(ARCIUM_CLUSTER_OFFSET, offset),
    compDefAccount: getCompDefAccAddress(sealed.programId, Buffer.from(getCompDefAccOffset(circuit)).readUInt32LE()),
    clusterAccount: getClusterAccAddress(ARCIUM_CLUSTER_OFFSET),
  };
}

export const randomOffset = () => new BN(Keypair.generate().publicKey.toBuffer().subarray(0, 8), "le");

const STEP = { SOL: 1, BTC: 500, ETH: 25 } as const;
const VOL = { SOL: 7_000, BTC: 4_500, ETH: 5_500 } as const;

const QUICK_MINUTES = Number(process.env.QUICK_MINUTES ?? 0);

const PLAN: { symbol: "SOL" | "BTC" | "ETH"; hours: number }[] = QUICK_MINUTES
  ? [{ symbol: "SOL", hours: QUICK_MINUTES / 60 }]
  : [
  { symbol: "SOL", hours: 6 },
  { symbol: "SOL", hours: 72 },
  { symbol: "BTC", hours: 72 },
  { symbol: "ETH", hours: 72 },
];

async function createMarkets(d: Deployment) {
  const mint = new PublicKey(d.mint);
  const creatorToken = (await getOrCreateAssociatedTokenAccount(conn, admin, mint, admin.publicKey)).address;
  for (const p of PLAN) {
    const a = ASSETS.find((x) => x.symbol === p.symbol)!;
    const upd = await hermes.getLatestPriceUpdates([a.pythFeedId]);
    const px = upd.parsed![0].price;
    const spot = Number(px.price) * 10 ** px.expo;
    const strike = Math.round(spot / STEP[p.symbol]) * STEP[p.symbol];
    const expiry = Math.floor(Date.now() / 1000 + p.hours * 3600);
    const id = Date.now() % 1_000_000_000;
    const market = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), admin.publicKey.toBuffer(), new BN(id).toArrayLike(Buffer, "le", 8)],
      markets.programId,
    )[0];
    const symbol = Array.from(Buffer.concat([Buffer.from(p.symbol), Buffer.alloc(16)]).subarray(0, 16));

    await markets.methods
      .createMarket({
        marketId: new BN(id),
        symbol,
        oracle: {
          pythFeedId: Array.from(Buffer.from(a.pythFeedId, "hex")),
          pythAccount: new PublicKey(d.oracles[p.symbol].pythAccount),
          sbFeed: new PublicKey(d.oracles[p.symbol].sbQuote),
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
        volBps: VOL[p.symbol],
        marginBps: 800,
        maxPayout: new BN(1_000 * USDC),
        funding: new BN(5_000 * USDC),
      })
      .accountsPartial({ house: admin.publicKey, market, mint, houseToken: creatorToken })
      .rpc({ commitment: "confirmed" });

    try {
      const offset = randomOffset();
      await sealed.methods
        .createBatch(offset, new BN(Math.floor(expiry - Math.min(3600, (p.hours * 3600) / 4))))
        .accountsPartial({ payer: admin.publicKey, market, mint, ...arciumAccounts(offset, "init_totals") })
        .rpc({ commitment: "confirmed" });
    } catch (e) {
      log("sealed batch skipped:", String(e).slice(0, 200));
    }

    await markets.methods
      .delegateMarket(new BN(id))
      .accountsPartial({ payer: admin.publicKey })
      .rpc({ commitment: "confirmed" });

    d.markets.push(market.toBase58());
    writeDeployment(d);
    log(`market ${p.symbol} ≥ ${strike} in ${(p.hours * 60).toFixed(0)}m →`, market.toBase58());
  }
}

async function main() {
  const d = readDeployment();
  d.marketsProgram = markets.programId.toBase58();
  d.sealedProgram = sealed.programId.toBase58();
  d.arciumClusterOffset = ARCIUM_CLUSTER_OFFSET;
  d.markets ??= [];
  const only = process.argv.slice(2);
  const want = (s: string) => only.length === 0 || only.includes(`--${s}`);

  if (want("mint")) await ensureMint(d);
  writeDeployment(d);
  if (want("oracles")) await ensureOracles(d);
  writeDeployment(d);
  if (want("compdefs")) await ensureCompDefs();
  if (want("markets")) await createMarkets(d);
  writeDeployment(d);
  log("done");
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
