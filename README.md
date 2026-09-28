<div align="center">

# 🕯️ Wick

**Trade the wick, not just the close.**

Wick-proof perps and prediction markets on Solana.
Liquidations, settlements and payouts all require **Pyth and Switchboard to agree**.

</div>

![Wick landing](docs/screens/landing.jpg)

## What it is

### Perpetuals: leverage that survives the wick
Long or short **SOL, BTC and ETH up to 50×**, executed on a MagicBlock rollup in about a second, against an LP pool anyone can join.

| | Feature | How |
|---|---|---|
| 🛡️ | **Wick-proof liquidations** | A position is only liquidated when Pyth **and** Switchboard both put it under maintenance margin, fresh and close to each other |
| 🔥 | **Liquidation insurance** | One click buys a touch ticket at your liquidation price, sized to repay your collateral if it's ever hit |
| 🔒 | **Hidden stop-losses** | Your stop is encrypted to Arcium; MPC compares it with the on-chain Pyth mark and reveals only "crossed or not" |
| 🏦 | **LP pool** | Earns fees, borrow and trader losses; each position's max profit is reserved at open so the pool never over-promises |
| 🎯 | **Limit, TP & SL orders** | Limit opens escrow collateral; the keeper fills any order once the pinned Pyth price crosses its trigger |
| ✂️ | **Partial close & margin** | Close 25/50/100% of a leg, or add/remove margin (bounded by max leverage and maintenance) |
| ⚡ | **One-click trading** | A 24h session key signs rollup trades: no wallet popup per trade, and no wallet simulation warnings |

### Prediction markets
Every market asks one question: *"Will SOL be ≥ $123 at Friday 17:00?"* You can take that view three ways, with market or **limit orders**, a live probability chart and a trade feed:

| | Mode | What you're betting on | Runs on |
|---|---|---|---|
| ⚡ | **Instant** | YES/NO shares against an FPMM pool. Buy and sell anytime, ~1s, no gas | MagicBlock ephemeral rollup |
| 🔥 | **Touch** | *"Does SOL trade through $125 before expiry?"* Pays the moment it happens | Solana, backed by a house vault |
| 🔒 | **Sealed** | Encrypted side and size, filled at one clearing price. Nobody sees your order | Arcium MPC |

| Marketplace | Touch bets and the live chart | Sealed batch |
|---|---|---|
| ![Markets](docs/screens/home.jpg) | ![Market](docs/screens/market.jpg) | ![Sealed](docs/screens/sealed.jpg) |

## How it works

```mermaid
flowchart LR
  U([Trader]) --> APP[Next.js app]
  APP -- "buy / sell (~1s, no gas)" --> ER[(MagicBlock ER)]
  APP -- "deposit · touch · claim" --> MK
  APP -- "encrypted order" --> SB
  subgraph Solana devnet
    MK[wick_markets<br/>pool · touch book · settle]
    SB[wick sealed batch<br/>Arcium MXE]
  end
  ER <-- "delegate / commit + undelegate" --> MK
  SB -- "queue computation" --> ARX{{Arcium cluster}}
  ARX -- "signed callback" --> SB
  SB -. "reads outcome" .-> MK
  PY[(Pyth push feed)] --> MK
  SW[(Switchboard quote)] --> MK
  K[[Keeper]] -- "price cranks" --> PY & SW
  K -- "confirm · settle · reveal" --> MK & SB
```

- **`wick_markets`** (Anchor) holds markets, the FPMM pool, touch books, dual-oracle settlement, and MagicBlock delegation.
- **`wick`** (Arcium MXE) runs the sealed batch and reads each market's outcome from `wick_markets`.
- **The keeper** refreshes both oracles and runs every permissionless crank: confirming touches, undelegating, settling, revealing, and paying sealed orders. Anyone can run these; the keeper just saves users the clicks. It also keeps a line-up of markets live, opening a new market (with sequential ids, so the app finds it automatically) whenever one runs out.

### Wick-proof liquidation

```mermaid
flowchart LR
  A[keeper or anyone<br/>calls liquidate_perp] --> B{Pyth ≤ 30s old<br/>Switchboard ≤ 60s old?}
  B -- no --> X[reject]
  B -- yes --> C{Oracles within<br/>max gap?}
  C -- no --> X
  C -- yes --> D{Equity < maintenance<br/>at BOTH prices?}
  D -- no --> X
  D -- yes --> L[liquidate · trader keeps<br/>equity above the fee]
```

### Perp trade flow

```mermaid
sequenceDiagram
  autonumber
  actor T as Trader
  participant B as Solana (base)
  participant E as MagicBlock ER
  participant A as Arcium
  T->>B: deposit USDC + delegate trading account
  T->>E: open 20x long SOL at the Pyth price (~1s)
  T->>B: optional touch ticket at liq price (insurance)
  T->>B: set_stop(encrypted stop price)
  loop every ~30s
    B->>A: check_stop(stop, on-chain Pyth mark)
    A-->>B: crossed? (yes / no only)
  end
  E->>E: close · close_by_stop · liquidate
  T->>B: withdraw USDC
```

### Market lifecycle

```mermaid
stateDiagram-v2
  [*] --> Open: create market + touch book + sealed batch
  state "Trading on MagicBlock" as ER
  Open --> ER: delegate
  ER --> ER: buy / sell
  ER --> Expired: expiry passes
  Expired --> Open: commit + undelegate
  Open --> Settled: both oracles agree
  Open --> Frozen: oracles disagree
  Frozen --> Voided: 24h later
  Settled --> [*]: claim 1.00 per winning share
  Voided --> [*]: claim 0.50 per share
```

### Dual-oracle settlement

```mermaid
flowchart LR
  A[settle after expiry] --> B{Pinned Pyth<br/>push feed?}
  B -- no --> X[reject]
  B -- yes --> C{Both prints within<br/>expiry + 5 min?}
  C -- no --> X
  C -- yes --> D{Same side<br/>of strike?}
  D -- no --> F[❄ Frozen]
  D -- yes --> E{Gap ≤ max?}
  E -- no --> F
  E -- yes --> S[✓ Settled]
  F -- 24h --> V[Voided · 0.50/share]
```

**Pyth** is a Wormhole-verified push feed. **Switchboard** is an Ed25519-verified oracle quote built only from Coinbase, Kraken and Bitstamp, so it doesn't depend on Pyth. If they disagree, the market **freezes** instead of paying the wrong side.

### Touch bets

A ticket's price is the driftless one-touch probability plus a house edge:

```
P(touch)      = 2 · (1 − Φ( |ln(level / spot)| / (σ·√T) ))
P(↑ before ↓) = min( ln(spot/low) / ln(high/low),  P(touch high) )
```

When you buy a ticket, its full payout is locked in the house vault, so the book can't go insolvent. A ticket wins only when **both** oracles print through the level within 30 seconds of each other.

### Sealed batch

```mermaid
sequenceDiagram
  autonumber
  actor T as Trader
  participant P as wick (sealed)
  participant A as Arcium cluster
  T->>T: encrypt {side, size} to MXE key
  T->>P: place_order(ciphertexts, public deposit)
  P->>A: add order to encrypted totals
  A-->>P: new encrypted totals
  Note over P: batch closes
  P->>A: reveal_totals (only if ≥ 3 orders)
  A-->>P: YES total, NO total → one clearing price
  Note over P: market settles
  P->>A: reveal_order
  A-->>P: side, size → payout
  T->>P: withdraw_payout
```

Orders stay sealed for the whole life of the market. Only the batch totals are revealed at close, and everyone fills at `YES_total / (YES_total + NO_total)`. Each order is opened only after resolution, to pay it out.

## Security model

| Threat | Mitigation |
|---|---|
| A flash wick liquidates a perp | Liquidation needs both oracles under maintenance, fresh and within the max gap |
| The perp pool over-promises | Each position's max profit (10× collateral) is reserved at open; LPs can't withdraw reserved liquidity |
| Stop-loss hunting | Stops are encrypted to Arcium; only "crossed or not" is revealed, and only for the position they were set on |
| A keeper fakes the mark for a stop | The stop check reads the pinned Pyth account on-chain; nobody can supply a price |
| One oracle is wrong or manipulated | Both must agree on side and within the max gap, or the market freezes |
| Settler picks a favourable print | Only the market's pinned Pyth push feed, printed within 5 minutes of expiry; a freeze can still resolve if they agree later in the window |
| Stale touch quotes | Quotes use the pinned push feed (≤20s old) and price off whichever oracle is less favourable to the buyer |
| A wick seen by one feed only | Touches need both oracles, within 30s of each other |
| House insolvency | Full payout is reserved at purchase; capacity is checked on-chain |
| Funds stuck in a frozen market | Anyone can void after 24h; shares redeem at 0.50, fully backed |
| Small sealed batches leak orders | Totals are revealed only with ≥ 3 orders; otherwise a full refund with nothing revealed. (Sybil orders can still shrink the anonymity set; this is a known limit of batch privacy.) |
| Late MPC callbacks | Callbacks must match the batch's pending order and the expected state |
| Batch squatting | Only the market creator can open its sealed batch |
| Near-certain touch tickets | Quotes above 95% are refused, not clamped |
| "↑ before ↓" order disputes | Its confirmations must use prints under 20s old, so the order of events is fixed in real time |
| Stuck MPC computations | Order payouts, batch reveals and inits can all be re-queued after a timeout |
| A stolen session key | It can only trade inside the owner's accounts on the rollup (never withdraw), and expires within 24h |
| Limit orders walking the pool | Prediction limit fills are checked on the average fill price, not the starting price |

> These are unaudited devnet contracts using a test USDC mint.

## Verified on devnet

A full lifecycle ran against devnet with scripted users:

- **Perps:** a 20× long SOL ($1,000 size) opened on MagicBlock in ~1s at $119.84 with a $114.59 liquidation price, then closed in 1.4s. The pool's liquidity, reserve and fees reconciled exactly.
- **One-click + orders:** a zero-SOL session key opened, half-closed and re-margined a position; the keeper filled a take-profit (19s), a limit long (13s) and a prediction limit buy (10s).
- **Hidden stop:** an encrypted stop on a 20× long fired after one Arcium check and the keeper closed the position on MagicBlock 19s after the stop was armed; the stop price never appeared on-chain.

- **Instant:** deposit, delegate, then buy and sell on MagicBlock in about 1 second each.
- **Touch:** tickets priced on-chain; 3 were confirmed as winners when both oracles printed through the level.
- **Settlement:** the market settled NO on Pyth $122.874 and Switchboard $122.88, 34 seconds after expiry.
- **Sealed:** 3 encrypted orders; Arcium revealed only the totals (YES $30, NO $15, clearing at 66.7¢); the winning order was paid $55.
- **Claims:** pool, touch and sealed payouts reached the wallet, and the creator's LP claim paid out with the vault staying solvent.

## Devnet deployment

| | Address |
|---|---|
| Markets program | `336JyfBdwevzzuuQ5dy1LF5aQPatq947z6Td6111qxow` |
| Sealed program (Arcium, cluster 456) | `8YY5NCZCPRcRy6tTPq3awnwW84LLe5LgECHNUNfx1wuT` |
| Mint, oracles, markets, perps | [`app/src/deployment.json`](app/src/deployment.json) |

## Repository

```
programs/wick_markets   perps + LP pool, prediction markets, FPMM pool, touch books, dual-oracle settlement, ER delegation
programs/wick           Arcium MXE program: sealed batches, hidden stop-losses
encrypted-ixs           Arcis circuits: init_totals, place_order, reveal_totals, reveal_order, check_stop
app                     Next.js: Three.js landing (/), perps (/perps), prediction markets (/predictions), LP pool (/liquidity), portfolio, docs
scripts                 setup · keeper · markets (open/discover) · oracles · status · e2e · claim
```

## Run it

```bash
cp .env.example .env                 # RPC_URL, ER_URL, PYTH_API_KEY, KEYPAIR
yarn && arcium build
cargo test -p wick_markets --lib     # pool, pricing and oracle-parsing tests

yarn setup                           # test USDC mint, oracle accounts, Arcium comp defs, markets
yarn perps-setup                     # perp LP pool + SOL/BTC/ETH markets, delegated to the ER
yarn keeper                          # oracle cranks, touch confirmation, settlement, sealed payouts
yarn status                          # one-screen snapshot of every market, batch and ticket
yarn e2e                             # scripted user: deposit → trade → touch → sealed order

cd app && cp .env.example .env.local && pnpm i && pnpm dev
```

Pyth's Hermes has required an API key since the Pyth Core upgrade (Aug 2026). The app proxies it server-side, so the key never reaches the browser.

**Built with:** Anchor · MagicBlock Ephemeral Rollups · Arcium · Pyth · Switchboard On-Demand · Next.js · Tailwind · lightweight-charts
