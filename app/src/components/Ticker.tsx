"use client";

import { ASSETS, AssetSymbol } from "@/lib/assets";
import { fmtUsd } from "@/lib/format";
import { useLivePrice } from "@/lib/prices";
import { useEffect, useRef, useState } from "react";

function Item({ s }: { s: AssetSymbol }) {
  const t = useLivePrice(s);
  const prev = useRef<number>(undefined);
  const [dir, setDir] = useState<0 | 1 | -1>(0);
  useEffect(() => {
    if (!t) return;
    if (prev.current != null && t.price !== prev.current) setDir(t.price > prev.current ? 1 : -1);
    prev.current = t.price;
  }, [t]);
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-2 w-2 rounded-full" style={{ background: ASSETS[s].color }} />
      <span className="text-[12px] text-muted">{s}/USD</span>
      <span className={`num text-[14px] transition-colors ${dir > 0 ? "text-yes" : dir < 0 ? "text-no" : ""}`}>
        {t ? fmtUsd(t.price) : "—"}
      </span>
    </div>
  );
}

export function Ticker() {
  return (
    <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 border-y hairline py-3.5">
      <span className="text-[10px] tracking-[0.18em] text-faint uppercase">Pyth · live</span>
      {(Object.keys(ASSETS) as AssetSymbol[]).map((s) => (
        <Item key={s} s={s} />
      ))}
    </div>
  );
}
