"use client";

import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { countdown, fmtNum } from "@/lib/format";
import { usePoll, useUsdc } from "@/lib/hooks";
import { placeSealedOrder, withdrawSealed } from "@/lib/sealed";
import { baseConn, pdas, sealedProgram } from "@/lib/wick";
import { useToast } from "./Toast";
import { AmountInput, Button, Row, Segmented } from "./ui";

const hex = () => Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

function stateName(s: object) {
  return Object.keys(s)[0] as "initializing" | "open" | "revealing" | "revealed";
}

export function SealedPanel({ k }: { k: PublicKey }) {
  const wallet = useAnchorWallet();
  const { push } = useToast();
  const usdc = useUsdc();
  const batchKey = pdas.batch(k);
  const batch = usePoll(() => sealedProgram(baseConn).account.sealedBatch.fetchNullable(batchKey), 4000, [k.toBase58()]);
  const order = usePoll(
    async () =>
      wallet ? sealedProgram(baseConn).account.sealedOrder.fetchNullable(pdas.order(batchKey, wallet.publicKey)) : null,
    3000,
    [k.toBase58(), wallet?.publicKey.toBase58()],
  );
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("20");
  const [deposit, setDeposit] = useState("50");
  const [busy, setBusy] = useState(false);
  const [cipher, setCipher] = useState<string[] | null>(null);
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);

  const b = batch.data;
  if (batch.loading && !b) return <div className="h-72 animate-pulse rounded-xl bg-ink" />;
  if (!b) return <p className="text-[13px] text-muted">No sealed batch for this market yet.</p>;

  const st = stateName(b.state);
  const closes = b.closeTs.toNumber() - now;
  const o = order.data;
  const oState = o ? (Object.keys(o.state)[0] as string) : null;
  const clearing = st === "revealed" && b.yesTotal.add(b.noTotal).gtn(0)
    ? b.yesTotal.toNumber() / b.yesTotal.add(b.noTotal).toNumber()
    : null;

  async function submit() {
    if (!wallet) return;
    setBusy(true);
    // Purely visual: show the ciphertext-like stream while the real encryption runs.
    const t = setInterval(() => setCipher([hex(), hex()]), 90);
    try {
      const sig = await placeSealedOrder(wallet, k, side, Number(amount), Number(deposit));
      push({ kind: "ok", title: "Sealed order submitted", body: "Arcium is folding it into the encrypted batch.", sig });
      order.refresh();
      batch.refresh();
      usdc.refresh();
    } catch (e) {
      push({ kind: "err", title: "Sealed order failed", body: (e as Error).message.slice(0, 180) });
    } finally {
      clearInterval(t);
      setTimeout(() => setCipher(null), 1400);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat k="Batch" v={st === "open" && closes > 0 ? "open" : st} />
        <Stat k={st === "open" ? "Closes in" : "Orders"} v={st === "open" ? countdown(closes) : String(b.orderCount)} />
        <Stat k="Escrowed" v={`$${fmtNum(b.escrowed.toNumber() / 1e6, 0)}`} />
      </div>

      {st === "revealed" && (
        <div className="rounded-xl border border-violet/30 bg-violet/5 p-3.5">
          <div className="text-[11px] tracking-wide text-violet uppercase">Revealed totals only</div>
          <Row k="YES side" v={`$${fmtNum(b.yesTotal.toNumber() / 1e6)}`} cls="text-yes" />
          <Row k="NO side" v={`$${fmtNum(b.noTotal.toNumber() / 1e6)}`} cls="text-no" />
          <Row k="Clearing price (YES)" v={clearing != null ? `${(clearing * 100).toFixed(1)}¢` : "one-sided → refund"} />
        </div>
      )}

      {o ? (
        <div className="rounded-xl border hairline bg-ink p-3.5">
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-semibold">Your sealed order</span>
            <span className="rounded-full border hairline px-2 py-0.5 text-[10px] text-violet">{oState}</span>
          </div>
          <Row k="Deposit (public)" v={`$${fmtNum(o.deposit.toNumber() / 1e6)}`} />
          <Row k="Side & size" v="🔒 encrypted" cls="text-violet" />
          {oState === "settled" && <Row k="Payout" v={`$${fmtNum(o.payout.toNumber() / 1e6)}`} cls="text-yes" />}
          {oState === "settled" && (
            <div className="mt-2">
              <Button
                tone="violet"
                onClick={async () => {
                  try {
                    const sig = await withdrawSealed(wallet!, k);
                    push({ kind: "ok", title: "Payout withdrawn", sig });
                    order.refresh();
                  } catch (e) {
                    push({ kind: "err", title: "Withdraw failed", body: (e as Error).message });
                  }
                }}
              >
                Withdraw payout
              </Button>
            </div>
          )}
        </div>
      ) : st === "open" && closes > 0 ? (
        <>
          <Segmented
            layoutId="sealed-side"
            value={side}
            onChange={setSide}
            options={[
              { value: "yes", label: "YES", activeClass: "text-yes" },
              { value: "no", label: "NO", activeClass: "text-no" },
            ]}
          />
          <AmountInput label="Size (hidden)" value={amount} onChange={setAmount} />
          <AmountInput label="Deposit (public cover)" value={deposit} onChange={setDeposit} max={usdc.data} />
          <p className="text-[11px] leading-relaxed text-faint">
            Observers see only your deposit. Side and size are encrypted to the Arcium cluster; unused deposit is refunded at settlement.
          </p>
          <AnimatePresence>
            {cipher && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="num overflow-hidden rounded-lg bg-ink p-2.5 text-[10px] leading-relaxed break-all text-violet/80"
              >
                side ⟶ {cipher[0]}
                <br />
                size ⟶ {cipher[1]}
              </motion.div>
            )}
          </AnimatePresence>
          <Button
            tone="violet"
            busy={busy}
            disabled={!wallet || !Number(amount) || Number(deposit) < Number(amount) || Number(deposit) < 0.1}
            onClick={submit}
          >
            Encrypt & submit
          </Button>
        </>
      ) : (
        <p className="text-[13px] text-muted">The batch is closed. Totals are revealed after it clears.</p>
      )}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-ink px-2 py-2.5">
      <div className="text-[10px] tracking-wide text-muted uppercase">{k}</div>
      <div className="num mt-0.5 text-[13px] capitalize">{v}</div>
    </div>
  );
}
