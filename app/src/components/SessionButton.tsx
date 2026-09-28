"use client";

import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { usePoll } from "@/lib/hooks";
import { activeSession, enableSession } from "@/lib/session";
import { useToast } from "./Toast";

/** Shows whether one-click trading (a session key) is on, and turns it on with one signature. */
export function SessionButton() {
  const wallet = useAnchorWallet();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const s = usePoll(async () => (wallet ? !!(await activeSession(wallet.publicKey)) : false), 15_000, [wallet?.publicKey.toBase58()]);
  if (!wallet) return null;
  if (s.data)
    return (
      <span
        title="Trades on the rollup are signed by a 24h session key in this browser: no wallet popups."
        className="hidden items-center gap-1.5 rounded-full border border-yes/30 px-3 py-1.5 text-[11px] text-yes lg:flex"
      >
        ⚡ One-click on
      </span>
    );
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const sig = await enableSession(wallet);
          push({ kind: "ok", title: "One-click trading on for 24h", body: "Rollup trades no longer need your wallet.", sig: sig ?? undefined });
          s.refresh();
        } catch (e) {
          push({ kind: "err", title: "Couldn't enable one-click", body: (e as Error).message.slice(0, 140) });
        } finally {
          setBusy(false);
        }
      }}
      className="hidden h-9 rounded-full border border-flame/40 px-3.5 text-[12px] text-flame-2 transition hover:bg-flame/10 lg:block"
    >
      {busy ? "…" : "⚡ Enable one-click"}
    </button>
  );
}
