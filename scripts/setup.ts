/**
 * One-time devnet bootstrap (idempotent where it can be):
 *   test USDC mint → oracle accounts → Arcium comp defs → markets + touch books + sealed batches.
 *
 *   RPC_URL=... npx tsx scripts/setup.ts [--markets]
 */
import {
  getArciumAccountBaseSeed,
  getArciumProgram,
  getArciumProgramId,
  getCompDefAccOffset,
  getLookupTableAddress,
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
import { openMarket, PLAN } from "./markets";
import { pushPyth, pushSwitchboard, pythAccount, sbFeedHash, sbQuoteAccount } from "./oracles";

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

const CIRCUITS = ["init_totals", "place_order", "reveal_totals", "reveal_order", "check_stop"] as const;

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
        check_stop: "initCheckStopCompDef",
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

const QUICK_MINUTES = Number(process.env.QUICK_MINUTES ?? 0);

async function createMarkets(d: Deployment) {
  const plan = QUICK_MINUTES ? [{ symbol: "SOL" as const, hours: QUICK_MINUTES / 60 }] : PLAN;
  for (const p of plan) {
    const key = await openMarket(d, p.symbol, p.hours);
    d.markets.push(key.toBase58());
    writeDeployment(d);
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
