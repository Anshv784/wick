"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Logo } from "./Logo";
import { FaucetButton } from "./FaucetButton";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

const links = [
  { href: "/markets", label: "Markets" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/docs", label: "Docs" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b hairline bg-ink/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-8 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="font-display text-[26px] leading-none tracking-tight">Wick</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active = l.href === "/markets" ? path.startsWith("/market") : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-3.5 py-1.5 text-[13px] transition ${active ? "bg-ink-3 text-paper" : "text-muted hover:text-paper"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-full border hairline px-3 py-1 text-[11px] text-muted lg:flex">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-yes" /> devnet
          </span>
          <FaucetButton />
          <WalletMultiButton />
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t hairline px-4 py-2 md:hidden">
        {links.map((l) => {
          const active = l.href === "/markets" ? path.startsWith("/market") : path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-3 py-1 text-[12px] ${active ? "bg-ink-3 text-paper" : "text-muted"}`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
