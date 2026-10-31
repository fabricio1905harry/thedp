"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCategoryMargin } from "@/app/admin/precificacao/actions";

/** Margin target per category (empty = follows the global margin). Also the alert threshold. */
export function CategoryMargins({
  categories,
  globalMargin,
  values,
}: {
  categories: string[];
  globalMargin: number;
  values: Record<string, number | null>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(categories.map((c) => [c, values[c] === null || values[c] === undefined ? "" : String(values[c])]))
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (categories.length === 0) return null;

  function save(category: string) {
    setMsg(null);
    start(async () => {
      const raw = draft[category]?.trim() ?? "";
      const res = await saveCategoryMargin(category, raw === "" ? null : Number(raw));
      setMsg(res.error ?? `Margem de “${category}” salva e produtos da categoria recalculados.`);
      router.refresh();
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-serif text-xl">Margem por categoria</h2>
        <p className="text-sm text-muted max-w-3xl">
          A margem da categoria vale para todos os produtos dela (a margem do próprio produto, quando existir, prevalece) e é a meta do alerta
          “Margem abaixo da meta”, calculado em USD e em EUR. Vazio = usa a margem desejada global ({globalMargin}%).
        </p>
      </div>
      <div className="border border-border divide-y divide-border max-w-xl">
        {categories.map((c) => (
          <div key={c} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="flex-1 min-w-0 truncate">{c}</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="94"
              placeholder={String(globalMargin)}
              aria-label={`Margem % de ${c}`}
              className="border border-border px-2 py-1 w-24 text-sm"
              value={draft[c] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [c]: e.target.value }))}
            />
            <span className="text-xs text-muted">%</span>
            <button type="button" disabled={pending} onClick={() => save(c)} className="border border-border px-3 py-1 text-xs">
              Salvar
            </button>
          </div>
        ))}
      </div>
      {msg && <p className="text-xs">{msg}</p>}
    </section>
  );
}
