"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, ReactNode, useCallback, useContext, useState } from "react";

type Toast = { id: number; kind: "ok" | "err" | "info"; title: string; body?: string; sig?: string; er?: boolean };
type Ctx = { push: (t: Omit<Toast, "id">) => void };

const ToastCtx = createContext<Ctx>({ push: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((xs) => [...xs, { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), 6500);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[340px] flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 30 }}
              className="panel pointer-events-auto bg-ink-2/95 p-3.5 backdrop-blur"
            >
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${t.kind === "ok" ? "bg-yes" : t.kind === "err" ? "bg-no" : "bg-flame"}`}
                />
                {t.title}
              </div>
              {t.body && <p className="mt-1 text-[12px] leading-snug text-muted">{t.body}</p>}
              {t.sig && (
                <a
                  className="num mt-1.5 block text-[11px] text-flame-2 hover:underline"
                  target="_blank"
                  href={
                    t.er
                      ? `https://explorer.solana.com/tx/${t.sig}?cluster=custom&customUrl=https%3A%2F%2Fdevnet.magicblock.app`
                      : `https://explorer.solana.com/tx/${t.sig}?cluster=devnet`
                  }
                >
                  {t.sig.slice(0, 20)}… ↗
                </a>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
