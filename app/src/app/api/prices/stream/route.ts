import { NextRequest } from "next/server";

// Pyth Hermes needs an API key since the Pyth Core upgrade; proxy the SSE stream so the key stays server-side.
const HERMES = process.env.PYTH_HERMES_URL ?? "https://pyth.dourolabs.app/hermes";

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.getAll("ids").filter((id) => /^[0-9a-f]{64}$/.test(id));
  if (!ids.length) return new Response("ids required", { status: 400 });
  const qs = ids.map((id) => `ids[]=${id}`).join("&");
  const upstream = await fetch(`${HERMES}/v2/updates/price/stream?${qs}&parsed=true&allow_unordered=true`, {
    headers: { Authorization: `Bearer ${process.env.PYTH_API_KEY ?? ""}` },
    signal: req.signal,
  });
  if (!upstream.ok || !upstream.body) return new Response("upstream error", { status: 502 });
  return new Response(upstream.body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
