"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";

export function MegaMenu({
  label,
  categories,
}: {
  label: string;
  categories: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        className="text-sm font-medium tracking-wide uppercase py-4 hover:text-accent transition-colors"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full w-[min(90vw,640px)] bg-background border border-border shadow-lg p-6 grid grid-cols-3 gap-4 z-40">
          {categories.map((category) => (
            <Link
              key={category}
              href={`/categorias/${encodeURIComponent(category.toLowerCase())}`}
              className="text-sm hover:text-accent transition-colors"
              onClick={() => setOpen(false)}
            >
              {category}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
