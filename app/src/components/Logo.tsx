import { useId } from "react";

/**
 * The Wick mark: a flame whose negative space is a candlestick. The upper wick of the
 * candle runs into the tip of the flame, which is the whole product in one glyph.
 */
export function Logo({ size = 24, glow = false }: { size?: number; glow?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className={glow ? "drop-shadow-[0_0_12px_rgba(255,106,40,0.55)]" : ""}>
      <defs>
        <linearGradient id={`g${id}`} x1="16" y1="1" x2="16" y2="31" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffd08a" />
          <stop offset="0.38" stopColor="#ff7a1a" />
          <stop offset="1" stopColor="#ff2e63" />
        </linearGradient>
        <mask id={`m${id}`}>
          <rect width="32" height="32" fill="white" />
          {/* candlestick cut out of the flame */}
          <rect x="15" y="9.5" width="2" height="17.5" rx="1" fill="black" />
          <rect x="12.4" y="15" width="7.2" height="8.6" rx="1.6" fill="black" />
        </mask>
      </defs>
      <path
        d="M16 1.5c3.4 4.3 9.6 9.7 9.6 17.1A9.6 9.6 0 0 1 16 28.3a9.6 9.6 0 0 1-9.6-9.7c0-4.4 2.3-7.2 4.4-9.4.3 2.3 1.4 3.9 2.9 4.6C13.2 9.4 14 5.6 16 1.5Z"
        fill={`url(#g${id})`}
        mask={`url(#m${id})`}
      />
    </svg>
  );
}

export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <Logo size={size} />
      <span className="font-display font-bold tracking-[-0.04em]" style={{ fontSize: size * 1.05, lineHeight: 1 }}>
        wick
      </span>
    </span>
  );
}
