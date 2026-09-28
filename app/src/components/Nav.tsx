"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { motion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { FaucetButton } from "./FaucetButton";
import { Wordmark } from "./Logo";
import { SessionButton } from "./SessionButton";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

const Icon = {
  perps: (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M2 11.5 6 7.5l3 3 5-6" />
      <path d="M10.5 4.5H14V8" />
    </svg>
  ),
  predictions: (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 2v6l4 2.5" />
    </svg>
  ),
  liquidity: (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M8 1.8c2.6 3.2 4.3 5.4 4.3 7.5a4.3 4.3 0 0 1-8.6 0C3.7 7.2 5.4 5 8 1.8Z" />
    </svg>
  ),
};

const PRODUCTS: { href: string; label: string; hint: string; icon: ReactNode }[] = [
  { href: "/perps", label: "Perps", hint: "50×", icon: Icon.perps },
  { href: "/predictions", label: "Predictions", hint: "YES/NO", icon: Icon.predictions },
  { href: "/liquidity", label: "Liquidity", hint: "earn", icon: Icon.liquidity },
];

const SECONDARY = [
  { href: "/portfolio", label: "Portfolio" },
  { href: "/docs", label: "Docs" },
];

function ConnectButton() {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  if (connected) return <WalletMultiButton />;
  return (
    <button
      onClick={() => setVisible(true)}
      className="h-9 rounded-full bg-paper px-4 text-[13px] font-semibold text-ink transition hover:bg-white"
    >
      Connect wallet
    </button>
  );
}

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b hairline bg-ink/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-6 px-4 sm:px-6">
        <Link href="/">
          <Wordmark size={24} />
        </Link>

        <nav className="hidden items-center rounded-full border hairline bg-ink-2/80 p-1 md:flex">
          {PRODUCTS.map((p) => {
            const active = path.startsWith(p.href);
            return (
              <Link
                key={p.href}
                href={p.href}
                className={`relative flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] transition ${active ? "text-paper" : "text-muted hover:text-paper"}`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-product"
                    className="absolute inset-0 rounded-full bg-ink-3 ring-1 ring-white/5"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className={`relative ${active ? "text-flame" : ""}`}>{p.icon}</span>
                <span className="relative font-medium">{p.label}</span>
                <span className="num relative rounded bg-white/[0.04] px-1 text-[10px] text-faint">{p.hint}</span>
              </Link>
            );
          })}
        </nav>

        <nav className="hidden items-center gap-1 lg:flex">
          {SECONDARY.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-3 py-1.5 text-[13px] transition ${path.startsWith(l.href) ? "text-paper" : "text-muted hover:text-paper"}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <span className="hidden items-center gap-1.5 rounded-full border hairline px-2.5 py-1 text-[11px] text-muted xl:flex">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-yes" /> Devnet
          </span>
          <SessionButton />
          <FaucetButton />
          <ConnectButton />
        </div>
      </div>

      {/* phones: products + secondary as one scrollable row */}
      <nav className="flex gap-1 overflow-x-auto border-t hairline px-4 py-2 md:hidden">
        {[...PRODUCTS, ...SECONDARY].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`shrink-0 rounded-full px-3 py-1 text-[12px] ${path.startsWith(l.href) ? "bg-ink-3 text-paper" : "text-muted"}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
