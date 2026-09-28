"use client";

import { useAnchorWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { marketQuestion } from "@/components/MarketCard";
import { StatusPill } from "@/components/StatusPill";
import { TicketList } from "@/components/TicketList";
import { fmtNum } from "@/lib/format";
import { useMarkets, usePoll, useTickets, useUsdc } from "@/lib/hooks";
import { baseConn, discoverMarketKeys, fetchPosition, pdas, sealedProgram } from "@/lib/wick";
import { borrowOwed, fetchPerps, liqPrice, pnl, PERP_SYMBOLS, Side, slotIndex } from "@/lib/perps";
import { useLivePrice } from "@/lib/prices";
import { fmtUsd } from "@/lib/format";
import type { AssetSymbol } from "@/lib/assets";

export default function Portfolio() {
  const wallet = useAnchorWallet();
  const usdc = useUsdc();
  const markets = useMarkets();
  const tickets = useTickets();
  const positions = usePoll(
    async () => {
      if (!wallet) return [];
      const keys = await discoverMarketKeys();
      const rows = await Promise.all(
        keys.map(async (k) => ({ k, p: await fetchPosition(pdas.position(k, wallet.publicKey)).catch(() => null) })),
      );
      return rows.filter((r) => r.p);
    },
    5000,
    [wallet?.publicKey.toBase58()],
  );

  const perps = usePoll(() => fetchPerps(wallet?.publicKey), 4000, [wallet?.publicKey.toBase58()]);
  const sealedOrders = usePoll(
    async () => {
      if (!wallet) return [];
      const rows = await sealedProgram(baseConn).account.sealedOrder.all([
        { dataSize: sealedProgram(baseConn).account.sealedOrder.size },
        { memcmp: { offset: 8 + 64 + 16 + 32, bytes: wallet.publicKey.toBase58() } },
      ]);
      return rows;
    },
    8000,
    [wallet?.publicKey.toBase58()],
  );

  if (!wallet) return <p className="pt-24 text-center text-muted">Connect a wallet to see your portfolio.</p>;

  const openTickets = (tickets.data ?? []).filter((r) => "open" in (r.t.status as object));
  const atRisk = openTickets.reduce((s, r) => s + r.t.stake.toNumber() / 1e6, 0);
  const upside = openTickets.reduce((s, r) => s + r.t.payout.toNumber() / 1e6, 0);

  return (
    <div className="pt-12">
      <h1 className="font-display text-[56px] leading-none tracking-tight">Portfolio</h1>
      <PerpsSummary perps={perps.data} />
      <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border hairline bg-line sm:grid-cols-3">
        <Stat k="Wallet USDC" v={`$${fmtNum(usdc.data ?? 0)}`} />
        <Stat k="Staked in touch tickets" v={`$${fmtNum(atRisk)}`} />
        <Stat k="Touch upside" v={`$${fmtNum(upside)}`} cls="text-flame" />
      </div>

      <h2 className="font-display mt-14 mb-1 text-[32px] tracking-tight">Prediction markets</h2>
      <p className="mb-4 text-[13px] text-muted">Pool shares, sealed orders and touch tickets.</p>
      <h3 className="mt-6 mb-3 text-[15px] font-semibold">Pool positions</h3>
      <div className="panel divide-y divide-line">
        {(positions.data ?? []).length === 0 && <p className="p-6 text-center text-[13px] text-muted">No positions yet.</p>}
        {(positions.data ?? []).map(({ k, p }) => {
          const m = markets.data?.find((r) => r.key.equals(k))?.m;
          const q = m ? marketQuestion(m.data) : null;
          return (
            <Link key={k.toBase58()} href={`/predict/${k.toBase58()}`} className="flex items-center gap-4 p-4 hover:bg-white/[0.02]">
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

      <h3 className="mt-8 mb-3 text-[15px] font-semibold">Sealed orders</h3>
      <div className="panel divide-y divide-line">
        {(sealedOrders.data ?? []).length === 0 && <p className="p-6 text-center text-[13px] text-muted">No sealed orders yet.</p>}
        {(sealedOrders.data ?? []).map(({ publicKey, account: o }) => {
          const st = Object.keys(o.state)[0];
          return (
            <div key={publicKey.toBase58()} className="flex items-center gap-4 p-4 text-[13px]">
              <span className="h-2 w-2 rounded-full bg-violet" />
              <div className="flex-1">
                <div className="num">deposit ${fmtNum(o.deposit.toNumber() / 1e6)} · side & size 🔒</div>
                <div className="text-[11px] text-muted">batch {o.batch.toBase58().slice(0, 8)}…</div>
              </div>
              <div className="text-right">
                <div className="num text-violet">{st === "settled" || st === "paid" ? `$${fmtNum(o.payout.toNumber() / 1e6)}` : "—"}</div>
                <div className="text-[11px] text-muted capitalize">{st}</div>
              </div>
            </div>
          );
        })}
      </div>

      <h3 className="mt-8 mb-3 text-[15px] font-semibold">Touch tickets</h3>
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

type Perps = Awaited<ReturnType<typeof fetchPerps>> | undefined;

function PerpsSummary({ perps }: { perps: Perps }) {
  const acc = perps?.account?.data;
  const pool = perps?.pool?.data;
  const lpValue =
    acc && pool && pool.shares.toNumber() ? (acc.lpShares.toNumber() * pool.liquidity.toNumber()) / pool.shares.toNumber() / 1e6 : 0;
  const rows = acc
    ? PERP_SYMBOLS.flatMap((s) => (["long", "short"] as Side[]).map((side) => ({ s, side, slot: acc.slots[slotIndex(s, side)] }))).filter(
        (r) => !r.slot.size.isZero(),
      )
    : [];
  return (
    <>
      <h2 className="font-display mt-10 mb-4 text-[32px] tracking-tight">Perps</h2>
      <div className="grid gap-px overflow-hidden rounded-2xl border hairline bg-line sm:grid-cols-3">
        <Stat k="Trading account" v={`$${fmtNum(acc ? acc.credit.toNumber() / 1e6 : 0)}`} />
        <Stat k="Open positions" v={String(rows.length)} />
        <Stat k="LP value (Earn)" v={`$${fmtNum(lpValue)}`} cls="text-flame" />
      </div>
      <div className="panel mt-4 divide-y divide-line">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-[13px] text-muted">
            No open perp positions.{" "}
            <Link href="/trade" className="text-flame-2 hover:underline">
              Trade →
            </Link>
          </p>
        ) : (
          rows.map((r) => <PerpRow key={`${r.s}${r.side}`} {...r} m={perps!.markets[r.s]!.data} />)
        )}
      </div>
    </>
  );
}

function PerpRow({
  s,
  side,
  slot,
  m,
}: {
  s: AssetSymbol;
  side: Side;
  slot: NonNullable<NonNullable<Perps>["account"]>["data"]["slots"][number];
  m: NonNullable<NonNullable<Perps>["markets"][AssetSymbol]>["data"];
}) {
  const t = useLivePrice(s);
  const size = slot.size.toNumber() / 1e6;
  const col = slot.collateral.toNumber() / 1e6;
  const entry = slot.entryPrice.toNumber() / 1e8;
  const owed = borrowOwed(size, slot.borrowIdx, m.borrowIdx);
  const mark = t?.price ?? entry;
  const p = Math.min(pnl(side, size, entry, mark), slot.reserve.toNumber() / 1e6) - owed;
  return (
    <Link href="/trade" className="flex items-center gap-4 p-4 text-[13px] hover:bg-white/[0.02]">
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${side === "long" ? "bg-yes/15 text-yes" : "bg-no/15 text-no"}`}>
        {side}
      </span>
      <span className="font-semibold">
        {s}-PERP <span className="num text-muted">{(size / col).toFixed(1)}×</span>
      </span>
      <span className="num text-muted">
        ${fmtNum(size)} @ {fmtUsd(entry)} · liq {fmtUsd(liqPrice(side, size, col, entry, m, owed))}
      </span>
      <span className={`num ml-auto ${p >= 0 ? "text-yes" : "text-no"}`}>
        {p >= 0 ? "+" : ""}${fmtNum(p)}
      </span>
    </Link>
  );
}
