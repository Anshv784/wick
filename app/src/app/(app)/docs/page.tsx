"use client";

import { ReactNode, useEffect, useState } from "react";
import { Mermaid } from "@/components/Mermaid";
import deployment from "@/deployment.json";
import { ARCHITECTURE, INSTANT, LIFECYCLE, LIQUIDATION, PERPS, SEALED, SETTLEMENT, TOUCH } from "@/lib/diagrams";

const SECTIONS = [
  ["overview", "Overview"],
  ["architecture", "Architecture"],
  ["perps", "Perpetuals"],
  ["liquidation", "Wick-proof liquidation"],
  ["lifecycle", "Market lifecycle"],
  ["instant", "Instant trading"],
  ["touch", "Touch bets"],
  ["settlement", "Dual-oracle settlement"],
  ["sealed", "Sealed batch"],
  ["security", "Security model"],
  ["addresses", "Programs & accounts"],
  ["run", "Run it locally"],
] as const;

export default function Docs() {
  const [active, setActive] = useState<string>("overview");
  useEffect(() => {
    const obs = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-20% 0px -70% 0px" },
    );
    SECTIONS.forEach(([id]) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <div className="grid gap-12 pt-12 lg:grid-cols-[200px_1fr]">
      <aside className="hidden lg:block">
        <nav className="sticky top-24 space-y-0.5">
          <div className="mb-3 text-[11px] tracking-[0.18em] text-faint uppercase">Docs</div>
          {SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className={`block rounded-lg px-3 py-1.5 text-[13px] transition ${active === id ? "bg-ink-3 text-paper" : "text-muted hover:text-paper"}`}
            >
              {label}
            </a>
          ))}
        </nav>
      </aside>

      <article className="max-w-[860px] min-w-0 space-y-20 pb-20">
        <Section id="overview" kicker="Wick" title="Trade the wick, not just the close.">
          <P>
            Wick has two products. <b>Perpetuals</b>: long or short SOL, BTC and ETH up to 50×, liquidated only when two
            independent oracles agree. <b>Prediction markets</b>: will an asset be at or above a strike at expiry, which you can
            trade three ways below. Every payout, liquidation and settlement needs Pyth and Switchboard to agree.
          </P>
          <Table
            head={["Mode", "What you're betting on", "Runs on"]}
            rows={[
              ["Perps", "Leveraged longs and shorts against an LP pool, with insurance and hidden stops", "MagicBlock ER + Arcium"],
              ["Instant", "YES/NO shares against an FPMM pool; buy and sell anytime", "MagicBlock ephemeral rollup"],
              ["Touch", "Price trades through a level at any moment before expiry", "Solana, backed by a house vault"],
              ["Sealed", "Encrypted side and size, filled at one clearing price", "Arcium MPC"],
            ]}
          />
        </Section>

        <Section id="architecture" kicker="System" title="Architecture">
          <P>
            Two Solana programs. <Code>wick_markets</Code> owns markets, the pool, touch books and settlement.{" "}
            <Code>wick</Code> is an Arcium MXE that runs the sealed batch and reads market outcomes from{" "}
            <Code>wick_markets</Code>. Markets and positions are delegated to MagicBlock while trading, then committed back to
            Solana to settle.
          </P>
          <Mermaid chart={ARCHITECTURE} />
        </Section>

        <Section id="perps" kicker="Wick-proof perps" title="Perpetuals">
          <P>
            Positions are priced off the market&apos;s pinned Pyth feed and executed on the MagicBlock rollup. The LP pool is the
            counterparty: it earns 0.06% open and close fees, 0.01% per hour borrow, and trader losses, and it pays trader profits.
            Each position&apos;s max profit (10× its collateral) is reserved in the pool at open, so the pool can never promise
            more than it holds. USDC only moves on Solana, into and out of your trading account.
          </P>
          <Mermaid chart={PERPS} />
          <P>
            <b>Liquidation insurance</b> is a touch ticket at your liquidation price on the asset&apos;s longest-running prediction
            market, sized to repay your collateral. <b>Hidden stops</b> are encrypted to the Arcium MXE; the cluster compares them
            with the on-chain Pyth mark and reveals only whether they were crossed.
          </P>
        </Section>

        <Section id="liquidation" kicker="The core idea" title="Wick-proof liquidation">
          <P>
            A liquidation needs both oracles, fresh and close to each other, to put the position under 0.5% maintenance margin.
            A flash wick on one feed can&apos;t trigger it. What&apos;s left of the collateral above the liquidation fee goes back
            to the trader.
          </P>
          <Mermaid chart={LIQUIDATION} />
        </Section>

        <Section id="lifecycle" kicker="State machine" title="Market lifecycle">
          <Mermaid chart={LIFECYCLE} />
          <P>
            Every transition after creation is permissionless. The keeper runs them so users don&apos;t have to, but anyone can.
            The keeper also rolls markets: it always keeps a short SOL market and a 3-day market per asset open. New markets use
            sequential ids, so the app discovers them without a registry.
          </P>
        </Section>

        <Section id="instant" kicker="MagicBlock" title="Instant trading">
          <P>
            Your USDC goes into the market vault once, as credit on your position. From then on, trades are pure state changes on the
            ephemeral rollup: no token transfers, no gas, about one second each. The pool is a fixed-product market maker. Every
            dollar mints one YES and one NO share, and the pool keeps <Code>yes × no</Code> constant, so the vault always covers
            payouts exactly.
          </P>
          <Mermaid chart={INSTANT} />
        </Section>

        <Section id="touch" kicker="Path bets" title="Touch bets">
          <P>
            Pick a level. If the price trades through it before expiry, the ticket pays the moment both oracles have printed through
            it. The quote is a driftless one-touch probability on log-price plus a house edge:
          </P>
          <pre className="panel num overflow-x-auto p-4 text-[13px] text-flame-2">
            {`P(touch) = 2 · (1 − Φ( |ln(level / spot)| / (σ · √T) ))
P(↑ before ↓) = min( ln(spot / low) / ln(high / low),  P(touch high) )`}
          </pre>
          <P>
            Buying a ticket locks its full payout in the house vault. If the house can&apos;t cover it, the ticket can&apos;t be sold,
            so the book can never go insolvent.
          </P>
          <Mermaid chart={TOUCH} />
        </Section>

        <Section id="settlement" kicker="Proofline, on Solana" title="Dual-oracle settlement">
          <P>
            Settlement reads a <b>Pyth</b> price update (Wormhole-verified) and a <b>Switchboard</b> oracle quote (Ed25519-verified,
            built only from Coinbase, Kraken and Bitstamp, so it doesn&apos;t depend on Pyth) inside the same instruction.
          </P>
          <Mermaid chart={SETTLEMENT} />
        </Section>

        <Section id="sealed" kicker="Arcium" title="Sealed batch">
          <P>
            Your side and size are encrypted in the browser to the Arcium MXE key. The cluster adds each order into running YES/NO
            totals that stay encrypted. When the batch closes, only the two totals are revealed, and everyone fills at{" "}
            <Code>YES_total / (YES_total + NO_total)</Code>. Individual orders stay sealed for the whole life of the market; each is opened
            only after resolution, to pay it out (the payout would reveal the same numbers anyway).
          </P>
          <Mermaid chart={SEALED} />
        </Section>

        <Section id="security" kicker="Threat model" title="Security model">
          <Table
            head={["Threat", "Mitigation"]}
            rows={[
              ["A flash wick liquidates a perp", "Liquidation needs Pyth and Switchboard both under maintenance, fresh and within the max gap"],
              ["The perp pool over-promises", "Each position's max profit (10× collateral) is reserved at open; withdrawals can't touch reserved liquidity"],
              ["Stop-loss hunting", "Stops are encrypted to Arcium; only 'crossed or not' is revealed, and only for the position they were set on"],
              ["A keeper fakes the mark for a stop", "The stop check reads the pinned Pyth account on-chain; the caller can't supply a price"],
              ["One oracle is wrong or manipulated", "Both must agree on side and within max gap, or the market freezes"],
              ["Settler shops for a favourable print", "Settlement only accepts the market's pinned Pyth push feed, printed within 5 minutes of expiry; a freeze can still resolve if they agree later in the window"],
              ["Stale touch quotes", "Quotes use the pinned push feed (≤20s old) and price off whichever oracle is less favourable to the buyer"],
              ["A single-feed wick", "Touches need both oracles through the level, within 30s of each other"],
              ["House insolvency", "Full payout is reserved at purchase; capacity is checked on-chain"],
              ["Frozen funds", "Anyone can void after 24h; shares redeem at 0.50, fully backed"],
              ["Small sealed batches leak orders", "Totals are revealed only with ≥ 3 orders; otherwise full refund, nothing revealed. Sybil orders can still shrink the anonymity set, a known limit of batch privacy."],
              ["Late MPC callback double-counts", "Callbacks must match the batch's pending order and expected state"],
              ["Someone front-runs the sealed batch", "Only the market creator can open its batch"],
              ["Near-certain touch tickets", "Quotes above 95% are refused, not clamped"],
              ["“↑ before ↓” order disputes", "Its confirmations must use prints under 20s old, so the order of events is fixed in real time"],
              ["Stuck MPC computations", "Order payouts, batch reveals and inits can all be re-queued after a timeout"],
            ]}
          />
          <P>These are unaudited devnet contracts using a test USDC mint.</P>
        </Section>

        <Section id="addresses" kicker="Devnet" title="Programs & accounts">
          <Table
            head={["", "Address"]}
            rows={[
              ["Markets program", deployment.marketsProgram],
              ["Sealed program (Arcium, cluster 456)", deployment.sealedProgram],
              ["Test USDC mint", deployment.mint],
              ["Perp LP pool", (deployment as unknown as { perps?: { pool: string } }).perps?.pool ?? "—"],
              ...Object.entries((deployment as unknown as { oracles: Record<string, { pythAccount: string; sbQuote: string }> }).oracles ?? {}).flatMap(
                ([s, o]) => [
                  [`${s} Pyth push feed`, o.pythAccount],
                  [`${s} Switchboard quote`, o.sbQuote],
                ],
              ),
            ]}
            mono
          />
        </Section>

        <Section id="run" kicker="Developers" title="Run it locally">
          <pre className="panel num overflow-x-auto p-4 text-[12.5px] leading-relaxed text-muted">{`arcium build
cp .env.example .env              # RPC_URL, ER_URL, PYTH_API_KEY, KEYPAIR
npx tsx scripts/setup.ts          # mint, oracle accounts, Arcium comp defs, markets
npx tsx scripts/keeper.ts         # price cranks, touch confirmation, settlement, sealed reveal
cd app && pnpm i && pnpm dev`}</pre>
        </Section>
      </article>
    </div>
  );
}

function Section({ id, kicker, title, children }: { id: string; kicker: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-5">
      <div>
        <div className="num text-[11px] tracking-wide text-flame-2 uppercase">{kicker}</div>
        <h2 className="font-display mt-2 text-[40px] leading-none tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

const P = ({ children }: { children: ReactNode }) => <p className="text-[15px] leading-relaxed text-muted [&_b]:text-paper">{children}</p>;
const Code = ({ children }: { children: ReactNode }) => (
  <code className="num rounded bg-ink-3 px-1.5 py-0.5 text-[12.5px] text-paper">{children}</code>
);

function Table({ head, rows, mono }: { head: string[]; rows: string[][]; mono?: boolean }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b hairline text-[11px] tracking-wide text-muted uppercase">
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.join()}>
              {r.map((c, i) => (
                <td key={i} className={`px-4 py-3 align-top ${i === 0 ? "text-paper" : "text-muted"} ${mono && i === 1 ? "num text-[12px] break-all" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
