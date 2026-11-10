"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";

/** Search box of the header, next to the bag (P50): goes to the Shop filtered by the text. */
export function HeaderSearch({ label, placeholder }: { label: string; placeholder: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = q.trim();
    router.push(text ? `/shop?q=${encodeURIComponent(text)}` : "/shop");
    setOpen(false);
  }

  return (
    <form role="search" onSubmit={submit} className="flex items-center">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={`${open ? "w-36 sm:w-44 border-b border-foreground px-1" : "w-0 sm:w-36 lg:w-44 sm:border-b sm:border-border sm:px-1"} bg-transparent py-1 text-xs outline-none transition-[width] duration-300 focus:border-foreground`}
      />
      <button
        type={open || q ? "submit" : "button"}
        onClick={(e) => {
          if (!open && !q && window.matchMedia("(max-width: 639px)").matches) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-label={label}
        className="p-1.5 hover:text-muted"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>
    </form>
  );
}
