"use client";

import { useAnchorWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { marketQuestion } from "@/components/MarketCard";
import { StatusPill } from "@/components/StatusPill";
import { TicketList } from "@/components/TicketList";
import { fmtNum } from "@/lib/format";
import { MARKET_KEYS, useMarkets, usePoll, useTickets, useUsdc } from "@/lib/hooks";
import { fetchPosition, pdas } from "@/lib/wick";

export default function Portfolio() {
  const wallet = useAnchorWallet();
  const usdc = useUsdc();
  const markets = useMarkets();
  const tickets = useTickets();
  const positions = usePoll(
    async () => {
      if (!wallet) return [];
      const rows = await Promise.all(
        MARKET_KEYS.map(async (k) => ({ k, p: await fetchPosition(pdas.position(k, wallet.publicKey)) })),
      );
      return rows.filter((r) => r.p);
    },
    5000,
    [wallet?.publicKey.toBase58()],
  );

  if (!wallet) return <p className="pt-24 text-center text-muted">Connect a wallet to see your portfolio.</p>;

  const openTickets = (tickets.data ?? []).filter((r) => "open" in (r.t.status as object));
  const atRisk = openTickets.reduce((s, r) => s + r.t.stake.toNumber() / 1e6, 0);
  const upside = openTickets.reduce((s, r) => s + r.t.payout.toNumber() / 1e6, 0);

  return (
    <div className="pt-12">
      <h1 className="font-display text-[56px] leading-none tracking-tight">Portfolio</h1>
      <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border hairline bg-line sm:grid-cols-3">
        <Stat k="Wallet USDC" v={`$${fmtNum(usdc.data ?? 0)}`} />
        <Stat k="Staked in touch tickets" v={`$${fmtNum(atRisk)}`} />
        <Stat k="Touch upside" v={`$${fmtNum(upside)}`} cls="text-flame" />
      </div>

      <h2 className="font-display mt-12 mb-4 text-[32px] tracking-tight">Pool positions</h2>
      <div className="panel divide-y divide-line">
        {(positions.data ?? []).length === 0 && <p className="p-6 text-center text-[13px] text-muted">No positions yet.</p>}
        {(positions.data ?? []).map(({ k, p }) => {
          const m = markets.data?.find((r) => r.key.equals(k))?.m;
          const q = m ? marketQuestion(m.data) : null;
          return (
            <Link key={k.toBase58()} href={`/market/${k.toBase58()}`} className="flex items-center gap-4 p-4 hover:bg-white/[0.02]">
              <div className="flex-1">
                <div className="text-[14px] font-semibold">{q ? `${q.text} · ${q.when}` : k.toBase58().slice(0, 8)}</div>
                <div className="num text-[12px] text-muted">
                  {fmtNum(p!.data.yes.toNumber() / 1e6)} YES · {fmtNum(p!.data.no.toNumber() / 1e6)} NO · credit $
                  {fmtNum(p!.data.balance.toNumber() / 1e6)}
                </div>
              </div>
              {m && <StatusPill m={m} />}
            </Link>
          );
        })}
      </div>

      <h2 className="font-display mt-12 mb-4 text-[32px] tracking-tight">Touch tickets</h2>
      <div className="panel px-5">
        <TicketList rows={tickets.data ?? []} onChange={tickets.refresh} />
      </div>
    </div>
  );
}

function Stat({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div className="bg-ink p-6">
      <div className="text-[11px] tracking-wide text-muted uppercase">{k}</div>
      <div className={`num mt-2 text-[28px] ${cls ?? ""}`}>{v}</div>
    </div>
  );
}
