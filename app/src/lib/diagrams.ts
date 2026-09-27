// Mermaid sources shared by the docs page and the README.

export const ARCHITECTURE = `flowchart LR
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
  K -- "confirm · settle · reveal" --> MK & SB`;

export const LIFECYCLE = `stateDiagram-v2
  [*] --> Open: create_market + touch book + sealed batch
  state "Trading on MagicBlock" as ER
  Open --> ER: delegate_market
  ER --> ER: buy / sell
  ER --> Expired: expiry passes
  Expired --> Open: commit + undelegate
  Open --> Settled: both oracles agree
  Open --> Frozen: oracles disagree
  Frozen --> Voided: 24h later
  Open --> Voided: nobody settled in 24h
  Settled --> [*]: claim 1.00 per winning share
  Voided --> [*]: claim 0.50 per share`;

export const SETTLEMENT = `flowchart LR
  A[settle_market after expiry] --> B{Pyth push feed<br/>= market's pinned account?}
  B -- no --> X[reject]
  B -- yes --> C{Both prints within<br/>expiry … expiry + 5 min?}
  C -- no --> X
  C -- yes --> D{Same side of strike?}
  D -- no --> F[❄ Frozen]
  D -- yes --> E{Gap ≤ max_dev_bps?}
  E -- no --> F
  E -- yes --> S[✓ Settled YES / NO]
  F -- "24h" --> V[Voided · 0.50 per share]`;

export const INSTANT = `sequenceDiagram
  autonumber
  actor T as Trader
  participant B as Solana (base)
  participant E as MagicBlock ER
  T->>B: open_position + deposit + delegate_position
  B-->>E: position now lives on the ER
  T->>E: buy YES (FPMM, ~1s, gasless)
  T->>E: sell / buy again …
  Note over E: market expires
  E->>B: commit + undelegate (keeper or anyone)
  B->>B: settle_market (dual oracle)
  T->>B: claim → USDC`;

export const TOUCH = `sequenceDiagram
  autonumber
  actor T as Trader
  participant M as wick_markets
  participant H as House vault
  participant K as Keeper (anyone)
  T->>M: buy_ticket(level, stake)
  M->>M: quote off Pyth (≤20s) and Switchboard, whichever is less favourable to the buyer
  M->>H: lock full payout
  Note over K: watches both feeds
  K->>M: confirm_touch(Pyth print, Switchboard quote)
  M->>M: both ≥ level, ≤30s apart, gap ok → Won
  T->>M: claim_ticket → payout
  Note over M: never confirmed by expiry + 10m → Lost, reserve returns to house`;

export const SEALED = `sequenceDiagram
  autonumber
  actor T as Trader
  participant P as wick (sealed)
  participant A as Arcium cluster
  T->>T: encrypt {side, size} to MXE key
  T->>P: place_order(ciphertexts, public deposit)
  P->>A: place_order(order, totals)
  A-->>P: new encrypted totals + stored order
  Note over P: batch closes
  P->>A: reveal_totals (only if ≥ 3 orders)
  A-->>P: YES total, NO total
  Note over P: market settles on wick_markets
  P->>A: reveal_order(order)
  A-->>P: side, size → program computes payout
  T->>P: withdraw_payout`;
