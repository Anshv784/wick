"use client";

import { motion } from "motion/react";
import { ReactNode } from "react";

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  layoutId,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; activeClass?: string }[];
  layoutId: string;
}) {
  return (
    <div className="flex rounded-full border hairline bg-ink p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`relative flex-1 rounded-full px-3 py-1.5 text-[12px] font-medium transition ${active ? (o.activeClass ?? "text-ink") : "text-muted hover:text-paper"}`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className={`absolute inset-0 rounded-full ${o.activeClass ? "bg-ink-3" : "bg-paper"}`}
                transition={{ type: "spring", stiffness: 400, damping: 34 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function AmountInput({
  value,
  onChange,
  suffix = "USDC",
  max,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  max?: number;
  label: string;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex justify-between text-[11px] text-muted">
        <span>{label}</span>
        {max != null && (
          <button className="num hover:text-paper" onClick={() => onChange(String(Math.floor(max * 100) / 100))}>
            max {max.toFixed(2)}
          </button>
        )}
      </div>
      <div className="flex items-center rounded-xl border hairline bg-ink px-3.5 focus-within:border-line-2">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.00"
          className="num h-11 w-full bg-transparent text-[18px] outline-none placeholder:text-faint"
        />
        <span className="text-[12px] text-muted">{suffix}</span>
      </div>
    </label>
  );
}

export function Row({ k, v, cls }: { k: ReactNode; v: ReactNode; cls?: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-[12px]">
      <span className="text-muted">{k}</span>
      <span className={`num ${cls ?? ""}`}>{v}</span>
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  tone = "paper",
  busy,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "paper" | "yes" | "no" | "flame" | "violet";
  busy?: boolean;
}) {
  const tones = {
    paper: "bg-paper text-ink",
    yes: "bg-yes text-ink",
    no: "bg-no text-ink",
    flame: "bg-flame text-ink",
    violet: "bg-violet text-ink",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className={`h-12 w-full rounded-xl text-[14px] font-semibold transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]}`}
    >
      {busy ? <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink align-middle" /> : children}
    </button>
  );
}
