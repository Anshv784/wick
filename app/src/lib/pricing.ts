// Mirrors programs/wick_markets/src/math.rs so the UI quotes exactly what the program charges.

export type TouchKind = "up" | "down" | "upBeforeDown";

const SECS_PER_YEAR = 31_536_000;
const MIN_PRICE_BPS = 100;
const MAX_PRICE_BPS = 9_500;

function erf(x: number) {
  // Abramowitz–Stegun 7.1.26 (display only; the program uses libm)
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-a * a);
  return s * y;
}

const normCdf = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));

function oneTouch(spot: number, barrier: number, sst: number) {
  const dist = Math.abs(Math.log(barrier / spot));
  return Math.min(1, Math.max(0, 2 * (1 - normCdf(dist / sst))));
}

export function touchFairBps(
  kind: TouchKind,
  spot: number,
  barrier: number,
  barrier2: number,
  volBps: number,
  tSecs: number,
): number | null {
  if (spot <= 0 || barrier <= 0 || tSecs <= 0) return null;
  const sst = (volBps / 10_000) * Math.sqrt(tSecs / SECS_PER_YEAR);
  let p: number;
  if (kind === "up") {
    if (barrier <= spot) return null;
    p = oneTouch(spot, barrier, sst);
  } else if (kind === "down") {
    if (barrier >= spot) return null;
    p = oneTouch(spot, barrier, sst);
  } else {
    if (!(barrier > spot && barrier2 > 0 && barrier2 < spot)) return null;
    const first = Math.log(spot / barrier2) / Math.log(barrier / barrier2);
    p = Math.min(first, oneTouch(spot, barrier, sst));
  }
  return Math.floor(p * 10_000);
}

/** Returns null for near-certain touches, which the program refuses to sell. */
export function touchQuoteBps(fairBps: number, marginBps: number) {
  const priced = fairBps + Math.floor((fairBps * marginBps) / 10_000);
  return priced > MAX_PRICE_BPS ? null : Math.max(MIN_PRICE_BPS, priced);
}

/** FPMM buy preview. Amount and reserves in USDC base units. */
export function fpmmBuy(sideRes: number, otherRes: number, collateral: number) {
  const k = BigInt(sideRes) * BigInt(otherRes);
  const side1 = BigInt(sideRes) + BigInt(collateral);
  const other1 = BigInt(otherRes) + BigInt(collateral);
  const newSide = (k + other1 - 1n) / other1;
  return { out: Number(side1 - newSide), newSide: Number(newSide), newOther: Number(other1) };
}

export function fpmmSell(sideRes: number, otherRes: number, shares: number) {
  const a = sideRes + shares;
  const b = otherRes;
  const k = sideRes * otherRes;
  const sum = a + b;
  const disc = sum * sum - 4 * (a * b - k);
  const c = Math.max(0, Math.floor((sum - Math.ceil(Math.sqrt(disc))) / 2));
  return { out: Math.min(c, b - 1), newSide: a - c, newOther: b - c };
}

export function yesBps(yesRes: number, noRes: number) {
  const t = yesRes + noRes;
  return t === 0 ? 5000 : Math.floor((noRes * 10_000) / t);
}
