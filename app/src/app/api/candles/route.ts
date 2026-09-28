import { NextRequest, NextResponse } from "next/server";

// Chart history comes from Coinbase's public candles; live ticks on top come from Pyth.
const PRODUCTS: Record<string, string> = { SOL: "SOL-USD", BTC: "BTC-USD", ETH: "ETH-USD" };

export async function GET(req: NextRequest) {
  const product = PRODUCTS[req.nextUrl.searchParams.get("symbol") ?? ""];
  if (!product) return NextResponse.json({ error: "unknown symbol" }, { status: 400 });
  // Coinbase granularities: 1m, 5m, 15m, 1h, 6h, 1d.
  const g = Number(req.nextUrl.searchParams.get("granularity") ?? 60);
  const granularity = [60, 300, 900, 3600, 21600, 86400].includes(g) ? g : 60;
  const r = await fetch(`https://api.exchange.coinbase.com/products/${product}/candles?granularity=${granularity}`, {
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
