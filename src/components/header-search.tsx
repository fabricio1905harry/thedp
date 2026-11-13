"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";

/**
 * Search of the header, next to the bag (P50). Only the magnifier sits in the header (so the header never
 * gets wider and never wraps); a click opens the field in a small panel right below it.
 */
export function HeaderSearch({ label, placeholder }: { label: string; placeholder: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = q.trim();
    router.push(text ? `/shop?q=${encodeURIComponent(text)}` : "/shop");
    setOpen(false);
  }

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={label} aria-expanded={open} className="p-1.5 hover:text-muted">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>
      {open && (
        <form
          role="search"
          onSubmit={submit}
          className="absolute right-0 top-full z-40 mt-2 flex w-[min(20rem,calc(100vw-2rem))] items-center gap-2 border border-border bg-background p-2 shadow-lg"
        >
          <input
            ref={input}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            aria-label={label}
            className="min-w-0 flex-1 border-b border-foreground bg-transparent px-1 py-1.5 text-sm outline-none"
          />
          <button type="submit" className="btn-primary shrink-0 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em]">
            {label}
          </button>
        </form>
      )}
    </div>
  );
}
