import { NextRequest, NextResponse } from "next/server";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import deployment from "@/deployment.json";

const AMOUNT = 1_000_000_000n; // 1,000 test USDC
const recent = new Map<string, number>();

export async function POST(req: NextRequest) {
  const secret = process.env.FAUCET_SECRET;
  if (!secret || !deployment.mint) {
    return NextResponse.json({ error: "Faucet not configured" }, { status: 503 });
  }
  let owner: PublicKey;
  try {
    owner = new PublicKey((await req.json()).owner);
  } catch {
    return NextResponse.json({ error: "Bad owner" }, { status: 400 });
  }
  const k = owner.toBase58();
  if (Date.now() - (recent.get(k) ?? 0) < 60_000) {
    return NextResponse.json({ error: "One drip per minute" }, { status: 429 });
  }
  recent.set(k, Date.now());

  const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));
  const mint = new PublicKey(deployment.mint);
  const conn = new Connection(process.env.RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL!, "confirmed");
  const ata = getAssociatedTokenAddressSync(mint, owner);
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, ata, owner, mint),
    createMintToInstruction(mint, ata, authority.publicKey, AMOUNT),
  );
  const sig = await conn.sendTransaction(tx, [authority]);
  await conn.confirmTransaction(sig, "confirmed");
  return NextResponse.json({ sig });
}
