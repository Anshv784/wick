export const PRICE_SCALE = 1e8;
export const USDC_SCALE = 1e6;

export function fmtUsd(v: number, digits?: number) {
  const d = digits ?? (Math.abs(v) >= 1000 ? 2 : Math.abs(v) >= 1 ? 2 : 4);
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

export function fmtNum(v: number, digits = 2) {
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(bps: number, digits = 1) {
  return `${(bps / 100).toFixed(digits)}%`;
}

export function fmtCompact(v: number) {
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
}

export function short(k: string, n = 4) {
  return `${k.slice(0, n)}…${k.slice(-n)}`;
}

export function countdown(secs: number) {
  if (secs <= 0) return "expired";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}
