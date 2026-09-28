import { BN } from "@anchor-lang/core";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  ata,
  baseConn,
  DELEGATION_PROGRAM,
  ensureAtaIx,
  erConn,
  marketsProgram,
  MINT,
  pdas,
  sendTx,
  TOKEN_PROGRAM_ID,
} from "./wick";
import type { TouchKind } from "./pricing";
import { sendEr, sessionSetupIxs } from "./session";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function isDelegated(key: PublicKey) {
  const info = await baseConn.getAccountInfo(key);
  return !!info && info.owner.equals(DELEGATION_PROGRAM);
}

/** Pulls a position back from the ER and waits until base owns it again. */
export async function undelegatePosition(wallet: AnchorWallet, market: PublicKey) {
  const position = pdas.position(market, wallet.publicKey);
  if (!(await isDelegated(position))) return null;
  const ix = await marketsProgram(erConn, wallet)
    .methods.undelegatePosition()
    .accountsPartial({ payer: wallet.publicKey, market, position })
    .instruction();
  const sig = await sendTx(erConn, wallet, [ix]);
  for (let i = 0; i < 40; i++) {
    if (!(await isDelegated(position))) return sig;
    await sleep(750);
  }
  throw new Error("Position is still syncing back from the rollup; try again in a moment.");
}

/**
 * Moves USDC into the market and puts the position on the ER so trades are instant.
 * Opens the position on first use.
 */
export async function fundPosition(wallet: AnchorWallet, market: PublicKey, usdc: number, toEr: boolean) {
  const program = marketsProgram(baseConn, wallet);
  const position = pdas.position(market, wallet.publicKey);
  await undelegatePosition(wallet, market);
  const exists = await baseConn.getAccountInfo(position);
  const ixs: TransactionInstruction[] = [];
  if (!exists) {
    ixs.push(await program.methods.openPosition().accountsPartial({ owner: wallet.publicKey, market }).instruction());
  }
  ixs.push(
    await program.methods
      .deposit(new BN(Math.round(usdc * 1e6)))
      .accountsPartial({
        owner: wallet.publicKey,
        position,
        vault: pdas.vault(market),
        mint: MINT!,
        ownerToken: ata(wallet.publicKey),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction(),
  );
  const orders = poolOrdersPda(market, wallet.publicKey);
  const ordersInfo = await baseConn.getAccountInfo(orders);
  if (!ordersInfo) {
    ixs.push(await program.methods.openPoolOrders().accountsPartial({ owner: wallet.publicKey, market }).instruction());
  }
  ixs.push(...(await sessionSetupIxs(wallet)));
  if (toEr) {
    ixs.push(
      await program.methods
        .delegatePosition()
        .accountsPartial({ payer: wallet.publicKey, marketKey: market })
        .instruction(),
    );
    if (!ordersInfo?.owner.equals(DELEGATION_PROGRAM)) {
      ixs.push(await program.methods.delegatePoolOrders().accountsPartial({ payer: wallet.publicKey, marketKey: market }).instruction());
    }
  }
  return sendTx(baseConn, wallet, ixs);
}

export const poolOrdersPda = (market: PublicKey, owner: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("pool_orders"), market.toBuffer(), owner.toBuffer()], marketsProgram(baseConn).programId)[0];

export async function trade(
  wallet: AnchorWallet,
  market: PublicKey,
  onEr: boolean,
  action: "buy" | "sell",
  side: "yes" | "no",
  amount: number,
  minOut: number,
) {
  const sideArg = side === "yes" ? { yes: {} } : { no: {} };
  const build = (signer: PublicKey, session: PublicKey | null) => {
    const program = marketsProgram(onEr ? erConn : baseConn);
    const accounts = { signer, market, position: pdas.position(market, wallet.publicKey), session };
    return action === "buy"
      ? program.methods.buy(sideArg, new BN(amount), new BN(minOut)).accountsPartial(accounts).instruction()
      : program.methods.sell(sideArg, new BN(amount), new BN(minOut)).accountsPartial(accounts).instruction();
  };
  if (onEr) return sendEr(wallet, build);
  return sendTx(baseConn, wallet, [await build(wallet.publicKey, null)]);
}

/** Limit order on the pool: buy when the side trades at or below `limitCents`, sell at or above. */
export function placePoolOrder(wallet: AnchorWallet, market: PublicKey, side: "yes" | "no", isBuy: boolean, amount: number, limitCents: number) {
  return sendEr(wallet, (signer, session) =>
    marketsProgram(erConn)
      .methods.placePoolOrder(side === "yes", isBuy, new BN(amount), Math.round(limitCents * 100))
      .accountsPartial({
        signer,
        market,
        position: pdas.position(market, wallet.publicKey),
        orders: poolOrdersPda(market, wallet.publicKey),
        session,
      })
      .instruction(),
  );
}

export function cancelPoolOrder(wallet: AnchorWallet, market: PublicKey, index: number) {
  return sendEr(wallet, (signer, session) =>
    marketsProgram(erConn)
      .methods.cancelPoolOrder(index)
      .accountsPartial({
        signer,
        market,
        position: pdas.position(market, wallet.publicKey),
        orders: poolOrdersPda(market, wallet.publicKey),
        session,
      })
      .instruction(),
  );
}

/** Claims a resolved position (or withdraws idle credit) back to the wallet. */
export async function claimPosition(wallet: AnchorWallet, market: PublicKey, mode: "claim" | { withdraw: number }) {
  await undelegatePosition(wallet, market);
  const program = marketsProgram(baseConn, wallet);
  const accounts = {
    owner: wallet.publicKey,
    position: pdas.position(market, wallet.publicKey),
    market,
    vault: pdas.vault(market),
    mint: MINT!,
    ownerToken: ata(wallet.publicKey),
    tokenProgram: TOKEN_PROGRAM_ID,
  };
  const ix =
    mode === "claim"
      ? await program.methods.claim().accountsPartial(accounts).instruction()
      : await program.methods.withdraw(new BN(Math.round(mode.withdraw * 1e6))).accountsPartial(accounts).instruction();
  return sendTx(baseConn, wallet, [ensureAtaIx(wallet.publicKey), ix]);
}

const KIND = { up: { up: {} }, down: { down: {} }, upBeforeDown: { upBeforeDown: {} } } as const;

export async function buyTicket(
  wallet: AnchorWallet,
  market: PublicKey,
  pythAccount: PublicKey,
  sbQuote: PublicKey,
  p: { kind: TouchKind; barrier: number; barrier2: number; stake: number; maxPriceBps: number },
) {
  const program = marketsProgram(baseConn, wallet);
  const book = pdas.book(market);
  const ix = await program.methods
    .buyTicket({
      kind: KIND[p.kind],
      barrier: new BN(Math.round(p.barrier * 1e8)),
      barrier2: new BN(Math.round(p.barrier2 * 1e8)),
      stake: new BN(Math.round(p.stake * 1e6)),
      maxPriceBps: p.maxPriceBps,
    })
    .accountsPartial({
      owner: wallet.publicKey,
      book,
      mint: MINT!,
      ownerToken: ata(wallet.publicKey),
      priceUpdate: pythAccount,
      sbFeed: sbQuote,
    })
    .instruction();
  return sendTx(baseConn, wallet, [ix]);
}

export async function claimTicket(wallet: AnchorWallet, book: PublicKey, ticket: PublicKey) {
  const ix = await marketsProgram(baseConn, wallet)
    .methods.claimTicket()
    .accountsPartial({
      owner: wallet.publicKey,
      book,
      ticket,
      touchVault: pdas.touchVault(book),
      mint: MINT!,
      ownerToken: ata(wallet.publicKey),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  return sendTx(baseConn, wallet, [ensureAtaIx(wallet.publicKey), ix]);
}
