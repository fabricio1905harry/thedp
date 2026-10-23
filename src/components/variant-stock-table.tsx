"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetVariantStockToSource, setVariantStock } from "@/app/admin/produtos/actions";

interface VariantRow {
  id: string;
  size: string;
  size_br?: string | null;
  size_us?: string | null;
  size_eu?: string | null;
  color: string;
  sku: string;
  stock: number;
  source_stock?: number | null;
  stock_override?: number | null;
}

/**
 * Stock per color + size. "Source" is what the supplier sync reports;
 * typing a value sets a manual override that wins over every future sync
 * until "Reset to source" (0 = unavailable).
 */
export function VariantStockTable({ variants }: { variants: VariantRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const overridden = variants.filter((v) => v.stock_override !== null && v.stock_override !== undefined);

  if (variants.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nenhuma variante ainda — adicione tamanhos/cores acima e salve para gerar a matriz.
      </p>
    );
  }

  return (
    <div className="max-w-3xl">
      {overridden.length > 0 && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await resetVariantStockToSource(overridden.map((v) => v.id));
              if (res && typeof res === "object" && "error" in res) {
                window.alert((res as { error: string }).error);
                return;
              }
              router.refresh();
            })
          }
          className="text-xs underline mb-2"
        >
          Restaurar tudo para o estoque/disponibilidade do fornecedor ({overridden.length})
        </button>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted uppercase border-b border-border">
            <th className="py-2 pr-3">Tamanho (BR)</th>
            <th className="py-2 pr-3">Tamanho (US)</th>
            <th className="py-2 pr-3">Tamanho (EU)</th>
            <th className="py-2 pr-3">Cor</th>
            <th className="py-2 pr-3">SKU</th>
            <th className="py-2 pr-3">Fornecedor</th>
            <th className="py-2">Estoque no site</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => (
            <VariantRowItem key={`${v.id}-${v.stock}`} variant={v} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VariantRowItem({ variant }: { variant: VariantRow }) {
  const router = useRouter();
  const [stock, setStock] = useState(variant.stock);
  const [pending, startTransition] = useTransition();
  const isOverride = variant.stock_override !== null && variant.stock_override !== undefined;

  function save(next: number) {
    setStock(next);
    startTransition(async () => {
      const res = await setVariantStock(variant.id, next);
      if (res && typeof res === "object" && "error" in res) {
        window.alert((res as { error: string }).error);
      }
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-border">
      <td className="py-2 pr-3 font-medium">{variant.size_br || variant.size}</td>
      <td className="py-2 pr-3 text-muted">{variant.size_us || "—"}</td>
      <td className="py-2 pr-3 text-muted">{variant.size_eu || "—"}</td>
      <td className="py-2 pr-3">{variant.color}</td>
      <td className="py-2 pr-3 text-muted text-xs font-mono">{variant.sku}</td>
      <td className="py-2 pr-3 text-muted">{variant.source_stock ?? "—"}</td>
      <td className="py-2 flex items-center gap-2">
        <input
          type="number"
          min={0}
          value={stock}
          disabled={pending}
          onChange={(e) => setStock(Number(e.target.value))}
          onBlur={() => stock !== variant.stock && save(stock)}
          className={`w-20 border px-2 py-1 text-sm text-center ${isOverride ? "border-foreground font-semibold" : "border-border"}`}
        />
        {isOverride && (
          <>
            <span className="text-[10px] uppercase">Manual</span>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await resetVariantStockToSource([variant.id]);
                  if (res && typeof res === "object" && "error" in res) {
                    window.alert((res as { error: string }).error);
                    return;
                  }
                  router.refresh();
                })
              }
              className="text-[11px] underline"
            >
              Restaurar do fornecedor
            </button>
          </>
        )}
      </td>
    </tr>
  );
}
