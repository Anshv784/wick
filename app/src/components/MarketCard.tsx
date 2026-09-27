"use client";

import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { motion } from "motion/react";
import { assetFromBytes } from "@/lib/assets";
import { countdown, fmtCompact, fmtUsd, PRICE_SCALE, USDC_SCALE } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { yesBps } from "@/lib/pricing";
import { useLivePrice } from "@/lib/prices";
import type { Located, MarketAccount } from "@/lib/wick";
import { StatusPill } from "./StatusPill";

export function marketQuestion(m: MarketAccount) {
  const a = assetFromBytes(m.symbol);
  const strike = m.strike.toNumber() / PRICE_SCALE;
  const d = new Date(m.expiry.toNumber() * 1000);
  const when = d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return { asset: a, strike, when, text: `${a?.symbol ?? "?"} ≥ ${fmtUsd(strike, 0)}` };
}

export function MarketCard({ k, m, i }: { k: PublicKey; m: Located<MarketAccount>; i: number }) {
  const now = useNow();
  const q = marketQuestion(m.data);
  const spot = useLivePrice(q.asset?.symbol);
  const yes = yesBps(m.data.yesReserve.toNumber(), m.data.noReserve.toNumber());
  const left = m.data.expiry.toNumber() - now;
  const dist = spot ? ((spot.price - q.strike) / q.strike) * 100 : null;

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
      <Link
        href={`/market/${k.toBase58()}`}
        className="panel group block p-5 transition hover:border-line-2 hover:bg-white/[0.035]"
      >
        <div className="flex items-center gap-3">
          <span
            className="grid h-9 w-9 place-items-center rounded-full text-[12px] font-bold text-ink"
            style={{ background: q.asset?.color }}
          >
            {q.asset?.symbol}
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold tracking-tight">
              {q.text} <span className="text-muted">at expiry?</span>
            </div>
            <div className="text-[12px] text-muted">{q.when}</div>
          </div>
          <div className="ml-auto">
            <StatusPill m={m} />
          </div>
        </div>

        <div className="mt-6 flex items-end justify-between">
          <div>
            <div className="num text-[40px] leading-none font-medium tracking-tight">
              {(yes / 100).toFixed(0)}
              <span className="text-[20px] text-muted">%</span>
            </div>
            <div className="mt-1 text-[11px] tracking-wide text-muted uppercase">chance YES</div>
          </div>
          <div className="text-right">
            <div className="num text-[15px]">{spot ? fmtUsd(spot.price) : "—"}</div>
            <div className={`num text-[11px] ${dist == null ? "text-muted" : dist >= 0 ? "text-yes" : "text-no"}`}>
              {dist == null ? "spot" : `${dist >= 0 ? "+" : ""}${dist.toFixed(2)}% vs strike`}
            </div>
          </div>
        </div>

        <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-no/25">
          <motion.div
            className="h-full rounded-full bg-yes"
            animate={{ width: `${yes / 100}%` }}
            transition={{ type: "spring", stiffness: 80, damping: 18 }}
          />
        </div>

        <div className="mt-4 flex items-center gap-4 border-t hairline pt-3 text-[11px] text-muted">
          <span className="num">{left > 0 ? countdown(left) : "expired"}</span>
          <span className="num">${fmtCompact(m.data.volume.toNumber() / USDC_SCALE)} vol</span>
          <span className="ml-auto flex gap-1.5">
            <Chip c="text-ice">Instant</Chip>
            <Chip c="text-flame-2">Touch</Chip>
            <Chip c="text-violet">Sealed</Chip>
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

function Chip({ c, children }: { c: string; children: string }) {
  return <span className={`rounded-full border hairline px-2 py-0.5 text-[10px] ${c}`}>{children}</span>;
}
