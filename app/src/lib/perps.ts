import { BN } from "@anchor-lang/core";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import deployment from "@/deployment.json";
import { ASSETS, AssetSymbol } from "./assets";
import { ata, baseConn, DELEGATION_PROGRAM, erConn, marketsProgram, MARKETS_ID, ORACLES, sendTx } from "./wick";

export type Side = "long" | "short";
export const PERP_SYMBOLS = Object.keys(ASSETS) as AssetSymbol[];
const USDC = 1_000_000;

const sym = (s: string) => Buffer.concat([Buffer.from(s), Buffer.alloc(16)]).subarray(0, 16);
const pda = (seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, MARKETS_ID)[0];

export const perpPdas = {
  pool: () => pda([Buffer.from("perp_pool")]),
  vault: () => pda([Buffer.from("perp_vault")]),
  market: (s: AssetSymbol) => pda([Buffer.from("perp_market"), sym(s)]),
  account: (owner: PublicKey) => pda([Buffer.from("perp_account"), owner.toBuffer()]),
};

export const PERPS_LIVE = !!(deployment as unknown as { perps?: object }).perps;

type Program = ReturnType<typeof marketsProgram>;
export type PerpPoolAcc = Awaited<ReturnType<Program["account"]["perpPool"]["fetch"]>>;
export type PerpMarketAcc = Awaited<ReturnType<Program["account"]["perpMarket"]["fetch"]>>;
export type PerpAccountAcc = Awaited<ReturnType<Program["account"]["perpAccount"]["fetch"]>>;

async function isDelegated(k: PublicKey) {
  const info = await baseConn.getAccountInfo(k);
  return !!info && info.owner.equals(DELEGATION_PROGRAM);
}

/** Reads perp state (pool, markets, trader account) from the ER when delegated, else base. */
export async function fetchPerps(owner?: PublicKey) {
  const keys = [perpPdas.pool(), ...PERP_SYMBOLS.map(perpPdas.market), ...(owner ? [perpPdas.account(owner)] : [])];
  const base = await baseConn.getMultipleAccountsInfo(keys);
  const erKeys = keys.filter((_, i) => base[i]?.owner.equals(DELEGATION_PROGRAM));
  const er = erKeys.length ? await erConn.getMultipleAccountsInfo(erKeys) : [];
  const coder = marketsProgram(baseConn).coder.accounts;
  const read = (i: number, name: string) => {
    const info = base[i];
    if (!info) return null;
    const onEr = info.owner.equals(DELEGATION_PROGRAM);
    const src = onEr ? er[erKeys.findIndex((k) => k.equals(keys[i]))] : info;
    return src ? { data: coder.decode(name, src.data), onEr } : null;
  };
  const pool = read(0, "perpPool") as { data: PerpPoolAcc; onEr: boolean } | null;
  const markets = Object.fromEntries(
    PERP_SYMBOLS.map((s, j) => [s, read(1 + j, "perpMarket") as { data: PerpMarketAcc; onEr: boolean } | null]),
  ) as Record<AssetSymbol, { data: PerpMarketAcc; onEr: boolean } | null>;
  const account = owner ? (read(keys.length - 1, "perpAccount") as { data: PerpAccountAcc; onEr: boolean } | null) : null;
  return { pool, markets, account };
}

// ---------------------------------------------------------------- math (mirrors programs/wick_markets/src/perps.rs)

export function slotIndex(s: AssetSymbol, side: Side) {
  return PERP_SYMBOLS.indexOf(s) * 2 + (side === "long" ? 0 : 1);
}

export function pnl(side: Side, size: number, entry: number, price: number) {
  return side === "long" ? (size * (price - entry)) / entry : (size * (entry - price)) / entry;
}

/** Price at which equity falls to maintenance margin (ignores borrow accrued after now). */
export function liqPrice(side: Side, size: number, collateral: number, entry: number, m: { maintBps: number; closeFeeBps: number }, borrowOwed = 0) {
  const buffer = (collateral - borrowOwed - (size * m.closeFeeBps) / 10_000 - (size * m.maintBps) / 10_000) / size;
  return side === "long" ? entry * (1 - buffer) : entry * (1 + buffer);
}

export function borrowOwed(size: number, slotIdx: BN, marketIdx: BN) {
  const d = marketIdx.sub(slotIdx);
  return d.isNeg() ? 0 : (size * Number(d.toString())) / 1e12;
}

// ---------------------------------------------------------------- actions

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitUndelegated(k: PublicKey) {
  for (let i = 0; i < 40; i++) {
    if (!(await isDelegated(k))) return;
    await sleep(750);
  }
  throw new Error("Account is still syncing back from the rollup; try again in a moment.");
}

async function undelegate(wallet: AnchorWallet) {
  const account = perpPdas.account(wallet.publicKey);
  if (!(await isDelegated(account))) return;
  const ix = await marketsProgram(erConn, wallet)
    .methods.undelegatePerpAccount()
    .accountsPartial({ payer: wallet.publicKey, account })
    .instruction();
  await sendTx(erConn, wallet, [ix]);
  await waitUndelegated(account);
}

/** Adds USDC to the trader's perp credit and (re)delegates the account to the ER. */
export async function depositPerp(wallet: AnchorWallet, usdc: number) {
  const program = marketsProgram(baseConn, wallet);
  const account = perpPdas.account(wallet.publicKey);
  await undelegate(wallet);
  const ixs: TransactionInstruction[] = [];
  if (!(await baseConn.getAccountInfo(account))) {
    ixs.push(await program.methods.openPerpAccount().accountsPartial({ owner: wallet.publicKey }).instruction());
  }
  ixs.push(
    await program.methods
      .perpDeposit(new BN(Math.round(usdc * USDC)))
      .accountsPartial({ owner: wallet.publicKey, account, ownerToken: ata(wallet.publicKey) })
      .instruction(),
    await program.methods.delegatePerpAccount().accountsPartial({ payer: wallet.publicKey }).instruction(),
  );
  return sendTx(baseConn, wallet, ixs);
}

/** Withdraws free credit to the wallet, then puts the account back on the ER. */
export async function withdrawPerp(wallet: AnchorWallet, usdc: number) {
  const program = marketsProgram(baseConn, wallet);
  const account = perpPdas.account(wallet.publicKey);
  await undelegate(wallet);
  return sendTx(baseConn, wallet, [
    await program.methods
      .perpWithdraw(new BN(Math.round(usdc * USDC)))
      .accountsPartial({ owner: wallet.publicKey, account, ownerToken: ata(wallet.publicKey) })
      .instruction(),
    await program.methods.delegatePerpAccount().accountsPartial({ payer: wallet.publicKey }).instruction(),
  ]);
}

function tradeAccounts(wallet: AnchorWallet, s: AssetSymbol) {
  return {
    owner: wallet.publicKey,
    pool: perpPdas.pool(),
    market: perpPdas.market(s),
    account: perpPdas.account(wallet.publicKey),
    priceUpdate: new PublicKey(ORACLES![s].pythAccount),
  };
}

const sideArg = (s: Side) => (s === "long" ? { long: {} } : { short: {} });

export async function openPerp(wallet: AnchorWallet, s: AssetSymbol, side: Side, collateral: number, leverage: number, limitPrice: number) {
  const ix = await marketsProgram(erConn, wallet)
    .methods.openPerp(sideArg(side), new BN(Math.round(collateral * USDC)), Math.round(leverage * 10), new BN(Math.round(limitPrice * 1e8)))
    .accountsPartial(tradeAccounts(wallet, s))
    .instruction();
  return sendTx(erConn, wallet, [ix]);
}

export async function closePerp(wallet: AnchorWallet, s: AssetSymbol, side: Side, limitPrice: number) {
  const ix = await marketsProgram(erConn, wallet)
    .methods.closePerp(sideArg(side), new BN(Math.round(limitPrice * 1e8)))
    .accountsPartial(tradeAccounts(wallet, s))
    .instruction();
  return sendTx(erConn, wallet, [ix]);
}

export async function lpDeposit(wallet: AnchorWallet, usdc: number) {
  const ix = await marketsProgram(erConn, wallet)
    .methods.lpDeposit(new BN(Math.round(usdc * USDC)))
    .accountsPartial({ owner: wallet.publicKey, pool: perpPdas.pool(), account: perpPdas.account(wallet.publicKey) })
    .instruction();
  return sendTx(erConn, wallet, [ix]);
}

export async function lpWithdraw(wallet: AnchorWallet, shares: BN) {
  const ix = await marketsProgram(erConn, wallet)
    .methods.lpWithdraw(shares)
    .accountsPartial({ owner: wallet.publicKey, pool: perpPdas.pool(), account: perpPdas.account(wallet.publicKey) })
    .instruction();
  return sendTx(erConn, wallet, [ix]);
}
