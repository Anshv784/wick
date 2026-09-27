# Wick

**Trade the wick, not just the close.** Wick is a set of prediction markets on Solana with three ways to take a view, and settlement that pays out only when two independent oracles agree.

| | What | Runs on |
|---|---|---|
| **Instant** | Buy/sell YES·NO against an FPMM pool, with ~1s confirmations and no gas | MagicBlock ephemeral rollup |
| **Touch** | "Does SOL trade through $125 before expiry?" Pays the moment the level prints | Solana, house-backed |
| **Sealed** | Encrypted side and size, cleared at one price. Only batch totals are revealed | Arcium MPC |

Each market asks a question like *"SOL ≥ $123 at Fri 17:00?"*

## Why it's trustworthy

- **Dual-oracle settlement.** Settlement reads a Pyth price update (Wormhole-verified) and a Switchboard oracle quote (Ed25519-verified, built from Coinbase, Kraken and Bitstamp, so it's independent of Pyth) inside the same instruction. Both prints must land within 10 minutes after expiry, fall on the same side of the strike, and sit within the market's max gap. **If any check fails, the market freezes** instead of guessing.
- **Frozen markets can't get stuck.** After 24h anyone can void a frozen market, and every share then redeems at 0.50. The vault covers this exactly, because every dollar that comes in mints exactly one YES share and one NO share.
- **Touches need both oracles too.** A touch ticket wins only when both oracles print through the level within 30s of each other, after purchase and before expiry.
- **The house can't be drained.** Buying a ticket locks its full payout in the house vault, so a ticket that can't be backed can't be bought.
- **Sealed is really sealed.** Orders are encrypted to the Arcium MXE, and the cluster keeps running totals under encryption. At close only `YES_total` and `NO_total` are revealed. Everyone fills at `YES_total / (YES_total + NO_total)`. Individual payouts are computed in MPC and revealed only after the market resolves.

## Architecture

```
programs/wick_markets   Anchor program: markets, FPMM pool, touch book, dual-oracle settle, ER delegation
programs/wick           Arcium MXE program: sealed batch (init_totals, place_order, reveal_totals, settle_order)
encrypted-ixs           Arcis circuits for the sealed batch
scripts/                setup (mint, oracles, comp defs, markets), keeper, e2e, status
app/                    Next.js frontend
```

**Layer split.** The pool and positions are delegated to MagicBlock, so trades are instant. Touch books and sealed batches stay on base so they can be read and settled directly. At expiry the keeper (or anyone) commits and undelegates the market, settles it on base, and users claim.

**Pricing touch tickets.** The quote is a driftless one-touch probability on log-price, `2·(1 − Φ(|ln(B/S)| / σ√T))`, plus house edge. For "↑ before ↓" it's `min(ln(S/L)/ln(H/L), P_touch(H))`. The UI mirrors the on-chain math exactly.

## Devnet

| | |
|---|---|
| Markets program | `336JyfBdwevzzuuQ5dy1LF5aQPatq947z6Td6111qxow` |
| Sealed (Arcium) program | `8YY5NCZCPRcRy6tTPq3awnwW84LLe5LgECHNUNfx1wuT` (cluster offset 456) |
| Addresses | [`app/src/deployment.json`](app/src/deployment.json) |

## Run it

```bash
# programs
arcium build
# env: RPC_URL, ER_URL, PYTH_API_KEY (Pyth Core requires one), KEYPAIR
npx tsx scripts/setup.ts            # mint, oracle accounts, Arcium comp defs, markets
npx tsx scripts/keeper.ts           # oracle cranks, touch confirmation, settlement, sealed reveal
npx tsx scripts/status.ts           # snapshot

cd app && pnpm i && pnpm dev        # app/.env.local: NEXT_PUBLIC_RPC_URL, NEXT_PUBLIC_ER_URL, PYTH_API_KEY, FAUCET_SECRET, RPC_URL
```

Every keeper action is permissionless. The keeper only saves users the clicks.

## Notes and limits

- These are unaudited devnet contracts using a test USDC mint.
- Switchboard quotes carry a slot rather than a timestamp, so print time is estimated at 400ms per slot.
- "↑ before ↓" relies on someone confirming the knock-out promptly. The house keeper has every incentive to do so.
- Sealed orders are processed one at a time (a busy lock). If a computation never calls back, the order can be cancelled after 3 minutes for a full refund.
