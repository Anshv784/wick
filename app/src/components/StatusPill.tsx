"use client";

import type { Located, MarketAccount } from "@/lib/wick";

export function marketStatus(m: MarketAccount): "open" | "settled" | "frozen" | "voided" {
  const s = m.status as Record<string, unknown>;
  if ("settled" in s) return "settled";
  if ("frozen" in s) return "frozen";
  if ("voided" in s) return "voided";
  return "open";
}

export function StatusPill({ m }: { m: Located<MarketAccount> }) {
  const s = marketStatus(m.data);
  const now = Date.now() / 1000;
  if (s === "open" && m.data.expiry.toNumber() <= now)
    return <Pill cls="border-flame/40 text-flame-2">Settling</Pill>;
  if (s === "open")
    return m.onEr ? (
      <Pill cls="border-ice/30 text-ice">
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-yes" /> Live · ER
      </Pill>
    ) : (
      <Pill cls="border-line-2 text-muted">Open · base</Pill>
    );
  if (s === "settled") {
    const yes = m.data.outcome && "yes" in (m.data.outcome as object);
    return <Pill cls={yes ? "border-yes/40 text-yes" : "border-no/40 text-no"}>Settled {yes ? "YES" : "NO"}</Pill>;
  }
  if (s === "frozen") return <Pill cls="border-ice/50 text-ice">❄ Frozen</Pill>;
  return <Pill cls="border-line-2 text-muted">Voided</Pill>;
}

function Pill({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${cls}`}>
      {children}
    </span>
  );
}
