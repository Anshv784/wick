const steps = [
  {
    n: "01",
    t: "Two oracles, never one",
    b: "Each market stores a Pyth feed id and a Switchboard oracle-quote account. Settlement and touch confirmation read both inside the same instruction. Neither oracle can move money on its own.",
  },
  {
    n: "02",
    t: "Agree, or freeze",
    b: "At expiry both prints must land in a 10-minute window, fall on the same side of the strike, and sit within the market's max gap. If any check fails the market freezes instead of guessing.",
  },
  {
    n: "03",
    t: "Frozen isn't stuck",
    b: "After 24 hours anyone can void a frozen market. Every YES and NO share then redeems at 0.50, and the vault covers it exactly, because each dollar in minted one YES and one NO.",
  },
  {
    n: "04",
    t: "Touches need both prints too",
    b: "A touch ticket pays only when Pyth and Switchboard both print through the level within 30 seconds of each other, after the ticket was bought and before expiry. A single-feed wick doesn't count.",
  },
  {
    n: "05",
    t: "The house can't go broke",
    b: "Buying a touch ticket locks its full payout in the house vault. If capacity isn't there, the ticket can't be bought. Losing tickets release their reserve back to the house.",
  },
  {
    n: "06",
    t: "Sealed means sealed",
    b: "Sealed orders are encrypted to the Arcium MXE. The cluster keeps running totals under encryption, reveals only the YES and NO totals at close, and fills everyone at one price. Individual orders are never revealed.",
  },
];

export default function How() {
  return (
    <div className="pt-16">
      <p className="text-[12px] tracking-[0.2em] text-muted uppercase">Settlement</p>
      <h1 className="font-display mt-4 max-w-3xl text-[64px] leading-[0.95] tracking-tight">
        Nothing pays until two <em className="text-flame">independent</em> sources agree.
      </h1>
      <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border hairline bg-line md:grid-cols-2">
        {steps.map((s) => (
          <div key={s.n} className="bg-ink p-7">
            <div className="num text-[12px] text-flame-2">{s.n}</div>
            <div className="mt-3 text-[19px] font-semibold tracking-tight">{s.t}</div>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">{s.b}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
