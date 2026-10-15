"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";

/** SHOP with the category list on hover (discovery); filters live inside the Shop page. */
export function MegaMenu({
  label,
  allLabel,
  categories,
}: {
  label: string;
  allLabel: string;
  categories: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Link
        href="/shop"
        className="text-[11px] font-semibold uppercase tracking-[0.2em] py-5 inline-block text-foreground hover:text-muted transition-colors"
        aria-expanded={open}
        onClick={() => setOpen(false)}
      >
        {label}
      </Link>
      {open && (
        <div className="absolute left-0 top-full min-w-[260px] bg-background border border-border shadow-lg p-5 z-40">
          <Link href="/shop" onClick={() => setOpen(false)} className="block text-[11px] font-semibold uppercase tracking-[0.2em] pb-3 mb-3 border-b border-border hover:text-muted">
            {allLabel}
          </Link>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2">
            {categories.map((category) => (
              <li key={category}>
                <Link
                  href={`/shop?category=${encodeURIComponent(category)}`}
                  onClick={() => setOpen(false)}
                  className="text-sm text-muted hover:text-foreground transition-colors"
                >
                  {category}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
