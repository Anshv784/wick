export function Logo({ size = 22 }: { size?: number }) {
  // A candle whose upper wick burns — the product in one glyph.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 1.5c1.6 2 2.2 3.4 1.2 4.9-.5.7-1.2 1-1.2 1s-.7-.3-1.2-1c-1-1.5-.4-2.9 1.2-4.9Z" fill="var(--flame)" className="flicker" />
      <rect x="11.25" y="7.5" width="1.5" height="3.5" rx=".75" fill="var(--paper)" />
      <rect x="8" y="11" width="8" height="8.5" rx="1.6" fill="var(--paper)" />
      <rect x="11.25" y="19.5" width="1.5" height="3" rx=".75" fill="var(--muted)" />
    </svg>
  );
}
