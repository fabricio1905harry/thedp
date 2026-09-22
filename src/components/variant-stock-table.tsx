"use client";

import { useState, useTransition } from "react";
import { setVariantStock } from "@/app/admin/produtos/actions";

interface VariantRow {
  id: string;
  size: string;
  size_br?: string | null;
  size_us?: string | null;
  size_eu?: string | null;
  color: string;
  sku: string;
  stock: number;
}

export function VariantStockTable({ variants }: { variants: VariantRow[] }) {
  if (variants.length === 0) {
    return (
      <p className="text-sm text-muted">
        No variants yet — add sizes/colors above and save to generate the matrix.
      </p>
    );
  }

  return (
    <table className="w-full text-sm max-w-2xl">
      <thead>
        <tr className="text-left text-xs text-muted uppercase border-b border-border">
          <th className="py-2 pr-3">Size (BR)</th>
          <th className="py-2 pr-3">Size (US)</th>
          <th className="py-2 pr-3">Size (EU)</th>
          <th className="py-2 pr-3">Color</th>
          <th className="py-2 pr-3">SKU</th>
          <th className="py-2">Stock</th>
        </tr>
      </thead>
      <tbody>
        {variants.map((v) => (
          <VariantRowItem key={v.id} variant={v} />
        ))}
      </tbody>
    </table>
  );
}

function VariantRowItem({ variant }: { variant: VariantRow }) {
  const [stock, setStock] = useState(variant.stock);
  const [pending, startTransition] = useTransition();

  function save(next: number) {
    setStock(next);
    startTransition(() => setVariantStock(variant.id, next));
  }

  return (
    <tr className="border-b border-border">
      <td className="py-2 pr-3 font-medium">{variant.size_br || variant.size}</td>
      <td className="py-2 pr-3 text-muted">{variant.size_us || "—"}</td>
      <td className="py-2 pr-3 text-muted">{variant.size_eu || "—"}</td>
      <td className="py-2 pr-3">{variant.color}</td>
      <td className="py-2 pr-3 text-muted text-xs font-mono">{variant.sku}</td>
      <td className="py-2">
        <input
          type="number"
          min={0}
          value={stock}
          disabled={pending}
          onChange={(e) => save(Number(e.target.value))}
          className="w-20 border border-border px-2 py-1 text-sm text-center"
        />
      </td>
    </tr>
  );
}
