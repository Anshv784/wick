import { NextRequest, NextResponse } from "next/server";

// Chart history comes from Coinbase's public candles; live ticks on top come from Pyth.
const PRODUCTS: Record<string, string> = { SOL: "SOL-USD", BTC: "BTC-USD", ETH: "ETH-USD" };

export async function GET(req: NextRequest) {
  const product = PRODUCTS[req.nextUrl.searchParams.get("symbol") ?? ""];
  if (!product) return NextResponse.json({ error: "unknown symbol" }, { status: 400 });
  const r = await fetch(`https://api.exchange.coinbase.com/products/${product}/candles?granularity=60`, {
    headers: { "User-Agent": "wick" },
    next: { revalidate: 30 },
  });
  if (!r.ok) return NextResponse.json([], { status: 200 });
  const rows = (await r.json()) as [number, number, number, number, number, number][];
  const candles = rows
    .map(([time, low, high, open, close]) => ({ time, open, high, low, close }))
    .sort((a, b) => a.time - b.time);
  return NextResponse.json(candles);
}
