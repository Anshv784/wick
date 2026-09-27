"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { useToast } from "./Toast";

export function FaucetButton() {
  const { publicKey } = useWallet();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  if (!publicKey) return null;
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await fetch("/api/faucet", {
            method: "POST",
            body: JSON.stringify({ owner: publicKey.toBase58() }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          push({ kind: "ok", title: "1,000 test USDC sent", sig: d.sig });
        } catch (e) {
          push({ kind: "err", title: "Faucet failed", body: String((e as Error).message) });
        } finally {
          setBusy(false);
        }
      }}
      className="hidden h-9 rounded-full border hairline px-3.5 text-[12px] text-muted transition hover:border-flame/60 hover:text-paper sm:block"
    >
      {busy ? "Dripping…" : "Get test USDC"}
    </button>
  );
}
