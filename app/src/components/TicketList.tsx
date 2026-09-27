"use client";

import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { claimTicket } from "@/lib/actions";
import { fmtNum, fmtUsd, PRICE_SCALE } from "@/lib/format";
import type { TicketRow } from "@/lib/hooks";
import { useToast } from "./Toast";

function kindLabel(kind: object, barrier: number, barrier2: number) {
  const k = Object.keys(kind)[0];
  if (k === "up") return `touch ↑ ${fmtUsd(barrier)}`;
  if (k === "down") return `touch ↓ ${fmtUsd(barrier)}`;
  return `${fmtUsd(barrier)} before ${fmtUsd(barrier2)}`;
}

export function TicketList({ rows, onChange }: { rows: TicketRow[]; onChange: () => void }) {
  const wallet = useAnchorWallet();
  const { push } = useToast();
  const [busy, setBusy] = useState<string>();
  if (!rows.length) return <p className="py-6 text-center text-[13px] text-muted">No touch tickets yet.</p>;
  return (
    <div className="divide-y divide-line">
      {rows.map(({ key, t }) => {
        const status = Object.keys(t.status)[0];
        const b = t.barrier.toNumber() / PRICE_SCALE;
        const b2 = t.barrier2.toNumber() / PRICE_SCALE;
        return (
          <div key={key.toBase58()} className="flex items-center gap-4 py-3 text-[13px]">
            <span
              className={`h-2 w-2 rounded-full ${status === "won" || status === "claimed" ? "bg-yes" : status === "lost" ? "bg-no" : "flicker bg-flame"}`}
            />
            <div className="min-w-0 flex-1">
              <div className="num truncate">{kindLabel(t.kind, b, b2)}</div>
              <div className="text-[11px] text-muted">
                stake ${fmtNum(t.stake.toNumber() / 1e6)} · spot at entry {fmtUsd(t.spot.toNumber() / PRICE_SCALE)}
              </div>
            </div>
            <div className="text-right">
              <div className="num text-flame-2">${fmtNum(t.payout.toNumber() / 1e6)}</div>
              <div className="text-[11px] text-muted capitalize">{status === "open" ? "watching" : status}</div>
            </div>
            {status === "won" && wallet && (
              <button
                disabled={busy === key.toBase58()}
                className="rounded-full bg-yes px-3 py-1.5 text-[12px] font-semibold text-ink"
                onClick={async () => {
                  setBusy(key.toBase58());
                  try {
                    const sig = await claimTicket(wallet, t.book as PublicKey, key);
                    push({ kind: "ok", title: "Touch payout claimed", sig });
                    onChange();
                  } catch (e) {
                    push({ kind: "err", title: "Claim failed", body: (e as Error).message });
                  } finally {
                    setBusy(undefined);
                  }
                }}
              >
                Claim
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
