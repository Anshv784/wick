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
  if (toEr) {
    ixs.push(
      await program.methods
        .delegatePosition()
        .accountsPartial({ payer: wallet.publicKey, marketKey: market })
        .instruction(),
    );
  }
  return sendTx(baseConn, wallet, ixs);
}

export async function trade(
  wallet: AnchorWallet,
  market: PublicKey,
  onEr: boolean,
  action: "buy" | "sell",
  side: "yes" | "no",
  amount: number,
  minOut: number,
) {
  const conn = onEr ? erConn : baseConn;
  const program = marketsProgram(conn, wallet);
  const sideArg = side === "yes" ? { yes: {} } : { no: {} };
  const accounts = { owner: wallet.publicKey, market, position: pdas.position(market, wallet.publicKey) };
  const ix =
    action === "buy"
      ? await program.methods.buy(sideArg, new BN(amount), new BN(minOut)).accountsPartial(accounts).instruction()
      : await program.methods.sell(sideArg, new BN(amount), new BN(minOut)).accountsPartial(accounts).instruction();
  return sendTx(conn, wallet, [ix]);
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
