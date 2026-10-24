"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";

/** "My account" dropdown: My account, My orders, Sign out. (The wholesale approval status lives inside the account page.) */
export function AccountMenu({
  labels,
  logout,
}: {
  labels: { account: string; accountMenu: string; myOrders: string; sair: string };
  logout: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "block w-full text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.15em] hover:bg-surface transition-colors";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={labels.accountMenu}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] hover:text-muted transition-colors whitespace-nowrap"
      >
        {labels.account}
        <svg viewBox="0 0 12 12" className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path d="M2 4.5 6 8l4-3.5" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 min-w-[190px] bg-background border border-border shadow-lg z-50 py-1">
          <Link role="menuitem" href="/minha-conta" onClick={() => setOpen(false)} className={item}>
            {labels.account}
          </Link>
          <Link role="menuitem" href="/minha-conta#pedidos" onClick={() => setOpen(false)} className={item}>
            {labels.myOrders}
          </Link>
          <form action={logout} className="border-t border-border mt-1 pt-1">
            <button type="submit" role="menuitem" className={`${item} text-muted`}>
              {labels.sair}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
