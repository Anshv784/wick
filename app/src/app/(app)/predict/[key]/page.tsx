"use client";

import { PublicKey } from "@solana/web3.js";
import { motion } from "motion/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { InstantPanel } from "@/components/InstantPanel";
import { marketQuestion } from "@/components/MarketCard";
import { ChartLine, PriceChart } from "@/components/PriceChart";
import { SealedPanel } from "@/components/SealedPanel";
import { SettlementProof } from "@/components/SettlementProof";
import { StatusPill } from "@/components/StatusPill";
import { TicketList } from "@/components/TicketList";
import { TouchPanel } from "@/components/TouchPanel";
import { countdown, fmtCompact, fmtUsd, USDC_SCALE } from "@/lib/format";
import { useMarket, useNow, useTickets } from "@/lib/hooks";
import { yesBps } from "@/lib/pricing";
import { useLivePrice } from "@/lib/prices";
import { pdas } from "@/lib/wick";

type Tab = "instant" | "touch" | "sealed";

const TABS: { id: Tab; label: string; sub: string; color: string }[] = [
  { id: "instant", label: "Instant", sub: "MagicBlock", color: "text-ice" },
  { id: "touch", label: "Touch", sub: "path bets", color: "text-flame-2" },
  { id: "sealed", label: "Sealed", sub: "Arcium", color: "text-violet" },
];

export default function MarketPage() {
  const params = useParams<{ key: string }>();
  const key = useMemo(() => {
    try {
      return new PublicKey(params.key);
    } catch {
      return undefined;
    }
  }, [params.key]);
  const market = useMarket(key);
  const tickets = useTickets(key ? pdas.book(key) : undefined);
  const now = useNow();
  const [tab, setTab] = useState<Tab>("touch");
  const [touchLines, setTouchLines] = useState<ChartLine[]>([]);

  const m = market.data;
  const q = m ? marketQuestion(m.data) : null;
  const spot = useLivePrice(q?.asset?.symbol);

  if (!key) return <p className="pt-20 text-muted">Invalid market address.</p>;
  if (market.loading && !m) return <div className="panel mt-10 h-[520px] animate-pulse" />;
  if (!m || !q?.asset) return <p className="pt-20 text-muted">Market not found.</p>;

  const yes = yesBps(m.data.yesReserve.toNumber(), m.data.noReserve.toNumber());
  const left = m.data.expiry.toNumber() - now;
  const lines: ChartLine[] = [
    { price: q.strike, color: "#f3efe6", title: "strike", dashed: true },
    ...(tab === "touch" ? touchLines : []),
  ];

  return (
    <div className="pt-8">
      <Link href="/predict" className="text-[12px] text-muted hover:text-paper">
        ← Prediction markets
      </Link>

      <div className="mt-4 flex flex-wrap items-end gap-x-10 gap-y-4">
        <div>
          <div className="flex items-center gap-3">
            <span
              className="grid h-10 w-10 place-items-center rounded-full text-[12px] font-bold text-ink"
              style={{ background: q.asset.color }}
            >
              {q.asset.symbol}
            </span>
            <StatusPill m={m} />
          </div>
          <h1 className="font-display mt-3 text-[44px] leading-none tracking-tight sm:text-[56px]">
            {q.asset.symbol} ≥ {fmtUsd(q.strike, 0)}
            <span className="text-muted italic"> by {q.when}?</span>
          </h1>
        </div>
        <div className="ml-auto flex gap-8">
          <Metric k="YES" v={`${(yes / 100).toFixed(1)}%`} cls="text-yes" />
          <Metric k="Spot" v={spot ? fmtUsd(spot.price) : "—"} />
          <Metric k="Expires" v={left > 0 ? countdown(left) : "expired"} />
          <Metric k="Volume" v={`$${fmtCompact(m.data.volume.toNumber() / USDC_SCALE)}`} />
        </div>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <div className="panel overflow-hidden p-2 pt-4">
            <PriceChart symbol={q.asset.symbol} lines={lines} />
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <SettlementProof m={m.data} />
            <div className="panel p-5">
              <h3 className="font-display text-[24px] tracking-tight">Your touch tickets</h3>
              <TicketList rows={tickets.data ?? []} onChange={tickets.refresh} />
            </div>
          </div>
        </div>

        <motion.aside
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          className="panel h-fit p-4 lg:sticky lg:top-20"
        >
          <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-ink p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative rounded-lg px-2 py-2 text-left transition ${tab === t.id ? "bg-ink-3" : "hover:bg-white/[0.03]"}`}
              >
                <div className={`text-[13px] font-semibold ${tab === t.id ? "text-paper" : "text-muted"}`}>{t.label}</div>
                <div className={`text-[10px] ${t.color}`}>{t.sub}</div>
              </button>
            ))}
          </div>
          {tab === "instant" && <InstantPanel k={key} m={m} refresh={market.refresh} />}
          {tab === "touch" && (
            <TouchPanel
              k={key}
              symbol={q.asset.symbol}
              expiry={m.data.expiry.toNumber()}
              onLines={setTouchLines}
              onBought={tickets.refresh}
            />
          )}
          {tab === "sealed" && <SealedPanel k={key} />}
        </motion.aside>
      </div>
    </div>
  );
}

function Metric({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.15em] text-muted uppercase">{k}</div>
      <div className={`num mt-1 text-[20px] ${cls ?? ""}`}>{v}</div>
    </div>
  );
}
