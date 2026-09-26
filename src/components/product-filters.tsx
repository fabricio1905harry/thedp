"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function ProductFilters({
  categories,
  initialQ,
  initialStatus,
  initialCategory,
}: {
  categories: string[];
  initialQ: string;
  initialStatus: string;
  initialCategory: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState(initialStatus);
  const [category, setCategory] = useState(initialCategory);
  const isFirstRender = useRef(true);

  function pushFilters(next: { q: string; status: string; category: string }) {
    const sp = new URLSearchParams();
    if (next.q) sp.set("q", next.q);
    if (next.status) sp.set("status", next.status);
    if (next.category) sp.set("category", next.category);
    router.push(`/admin/produtos${sp.toString() ? `?${sp.toString()}` : ""}`);
  }

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timeout = setTimeout(() => pushFilters({ q, status, category }), 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function handleStatusChange(value: string) {
    setStatus(value);
    pushFilters({ q, status: value, category });
  }

  function handleCategoryChange(value: string) {
    setCategory(value);
    pushFilters({ q, status, category: value });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by title…"
        className="border border-border px-3 py-1.5 text-sm w-56"
      />
      <select
        value={status}
        onChange={(e) => handleStatusChange(e.target.value)}
        className="border border-border px-3 py-1.5 text-sm bg-background"
      >
        <option value="">All statuses</option>
        <option value="draft">Draft</option>
        <option value="published">Published</option>
        <option value="archived">Archived</option>
      </select>
      <select
        value={category}
        onChange={(e) => handleCategoryChange(e.target.value)}
        className="border border-border px-3 py-1.5 text-sm bg-background"
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {(q || status || category) && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            setStatus("");
            setCategory("");
            router.push("/admin/produtos");
          }}
          className="text-xs text-muted hover:text-accent underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
