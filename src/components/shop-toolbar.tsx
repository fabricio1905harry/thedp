"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";

/**
 * Shop toolbar: a discreet "Filters" button (closed on arrival, so the products
 * are the first thing the visitor sees) and a compact "Sort by" select next to the grid.
 * The filter options (server-rendered chips) are passed as children.
 */
export function ShopToolbar({
  defaultOpen,
  activeCount,
  filtersLabel,
  activeLabel,
  sortLabel,
  sortOptions,
  sortValue,
  params,
  children,
}: {
  defaultOpen: boolean;
  activeCount: number;
  filtersLabel: string;
  activeLabel: string;
  sortLabel: string;
  sortOptions: { value: string; label: string }[];
  sortValue: string;
  /** current query string values, to keep when sorting */
  params: Record<string, string>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const router = useRouter();

  function changeSort(value: string) {
    const next = new URLSearchParams(params);
    next.set("sort", value);
    const qs = next.toString();
    router.push(qs ? `/shop?${qs}` : "/shop");
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-4 border-y border-border py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] hover:text-muted transition-colors"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden="true">
            <path d="M2 4h12M4.5 8h7M7 12h2" strokeLinecap="round" />
          </svg>
          {filtersLabel}
          {activeCount > 0 && <span className="text-muted normal-case tracking-normal">· {activeLabel.replace("{n}", String(activeCount))}</span>}
        </button>
        <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.15em] text-muted">
          <span className="hidden sm:inline">{sortLabel}</span>
          <select
            aria-label={sortLabel}
            value={sortValue}
            onChange={(e) => changeSort(e.target.value)}
            className="border border-border bg-background px-2 py-1.5 text-[11px] uppercase tracking-[0.1em] text-foreground"
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {open && <div className="border-b border-border py-6">{children}</div>}
    </div>
  );
}
