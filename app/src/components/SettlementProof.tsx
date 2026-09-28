"use client";

import { fmtUsd, PRICE_SCALE } from "@/lib/format";
import type { MarketAccount } from "@/lib/wick";
import { marketStatus } from "./StatusPill";

/** The Proofline idea made visible: two independent prints, one verdict. */
export function SettlementProof({ m }: { m: MarketAccount }) {
  const status = marketStatus(m);
  const strike = m.strike.toNumber() / PRICE_SCALE;
  const pyth = m.settlePyth.toNumber() / PRICE_SCALE;
  const sb = m.settleSb.toNumber() / PRICE_SCALE;
  const resolved = status !== "open" && pyth > 0;
  const gapBps = resolved ? (Math.abs(pyth - sb) / Math.min(pyth, sb)) * 10_000 : 0;
  const maxDev = m.oracle.maxDevBps;

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[24px] tracking-tight">Settlement proof</h3>
        <span className="text-[11px] text-muted">max gap {(maxDev / 100).toFixed(2)}%</span>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
        <Source name="Pyth" sub="pull oracle · Wormhole-verified" value={resolved ? pyth : null} strike={strike} />
        <div className="flex flex-col items-center justify-center gap-1">
          <span className="h-full w-px bg-line" />
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${
              !resolved
                ? "border-line-2 text-muted"
                : status === "frozen"
                  ? "border-ice/50 text-ice"
                  : "border-yes/50 text-yes"
            }`}
          >
            {!resolved ? "awaiting" : status === "frozen" ? "DISAGREE" : "AGREE"}
          </span>
          <span className="h-full w-px bg-line" />
        </div>
        <Source name="Switchboard" sub="oracle quote · Ed25519-verified" value={resolved ? sb : null} strike={strike} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 border-t hairline pt-3 text-[11px]">
        <div>
          <div className="text-muted">Strike</div>
          <div className="num text-[13px]">{fmtUsd(strike)}</div>
        </div>
        <div>
          <div className="text-muted">Gap</div>
          <div className={`num text-[13px] ${resolved && gapBps > maxDev ? "text-no" : ""}`}>
            {resolved ? `${(gapBps / 100).toFixed(3)}%` : "—"}
          </div>
        </div>
        <div>
          <div className="text-muted">Verdict</div>
          <div className="num text-[13px]">
            {status === "settled"
              ? m.outcome && "yes" in (m.outcome as object)
                ? "YES"
                : "NO"
              : status === "frozen"
                ? "Frozen"
                : status === "voided"
                  ? "Void"
                  : "Pending"}
          </div>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        Both prints must land within 10 minutes after expiry, on the same side of the strike, and within the max gap. Anything else freezes the market. If it can&apos;t resolve within 24h it voids and every share redeems at 0.50.
      </p>
    </div>
  );
}

function Source({ name, sub, value, strike }: { name: string; sub: string; value: number | null; strike: number }) {
  return (
    <div className="rounded-xl bg-ink p-3.5">
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/logos/${name.toLowerCase()}.png`} alt="" className="h-5 w-5 rounded" />
        {name}
      </div>
      <div className="text-[10px] text-faint">{sub}</div>
      <div className="num mt-3 text-[18px]">{value ? fmtUsd(value) : "—"}</div>
      {value != null && (
        <div className={`text-[11px] ${value >= strike ? "text-yes" : "text-no"}`}>
          {value >= strike ? "≥ strike → YES" : "< strike → NO"}
        </div>
      )}
    </div>
  );
}
