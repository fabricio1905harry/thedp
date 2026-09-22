"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setProductStatus } from "@/app/admin/produtos/actions";

interface Row {
  id: string;
  title: string;
  category: string | null;
  status: string;
  price_brl: number | null;
  suppliers?: string[];
}

export function ProductModerationTable({ products }: { products: Row[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === products.length ? new Set() : new Set(products.map((p) => p.id))
    );
  }

  function bulkSetStatus(status: "draft" | "published" | "archived") {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    startTransition(async () => {
      await setProductStatus(ids, status);
      setSelected(new Set());
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 min-h-9">
        {selected.size > 0 && (
          <>
            <span className="text-xs text-muted mr-2">{selected.size} selected</span>
            <button
              disabled={pending}
              onClick={() => bulkSetStatus("published")}
              className="text-xs bg-accent text-white px-3 py-1.5 disabled:opacity-50"
            >
              Publish
            </button>
            <button
              disabled={pending}
              onClick={() => bulkSetStatus("draft")}
              className="text-xs border border-border px-3 py-1.5 disabled:opacity-50"
            >
              Unpublish
            </button>
            <button
              disabled={pending}
              onClick={() => bulkSetStatus("archived")}
              className="text-xs border border-border px-3 py-1.5 disabled:opacity-50"
            >
              Archive
            </button>
          </>
        )}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted uppercase border-b border-border">
            <th className="py-2 pr-2 w-8">
              <input
                type="checkbox"
                checked={selected.size === products.length && products.length > 0}
                onChange={toggleAll}
              />
            </th>
            <th className="py-2 pr-4">Title</th>
            <th className="py-2 pr-4">Category</th>
            <th className="py-2 pr-4">Supplier(s)</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Price</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-b border-border">
              <td className="py-2 pr-2">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                />
              </td>
              <td className="py-2 pr-4">{p.title}</td>
              <td className="py-2 pr-4">{p.category}</td>
              <td className="py-2 pr-4 text-xs text-muted">
                {p.suppliers && p.suppliers.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {p.suppliers.map((s) => (
                      <span key={s} className="bg-surface border border-border px-1.5 py-0.5 font-mono text-[10px]">
                        {s}
                      </span>
                    ))}
                  </div>
                ) : (
                  "—"
                )}
              </td>
              <td className="py-2 pr-4">
                <StatusBadge status={p.status} />
              </td>
              <td className="py-2 pr-4">
                {p.price_brl !== null ? `${p.price_brl} BRL` : "—"}
              </td>
              <td className="py-2 text-right">
                <Link href={`/admin/produtos/${p.id}`} className="text-xs text-accent underline">
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-surface text-muted",
    published: "bg-accent/10 text-accent",
    archived: "bg-surface text-muted line-through",
  };
  return (
    <span className={`text-xs px-2 py-0.5 ${styles[status] ?? ""}`}>{status}</span>
  );
}
