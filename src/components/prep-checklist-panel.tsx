"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPrepTask, setPrepTaskForAll } from "@/app/admin/pedidos/[id]/shipping-actions";

const TASKS = [
  ["labels", "Etiquetas"],
  ["tags", "Tags"],
  ["bagging", "Ensacamento"],
] as const;

export interface PrepLine {
  id: string;
  title: string;
  detail: string;
  qty: number;
  done: Record<string, boolean>;
}

export function PrepChecklistPanel({ orderId, lines }: { orderId: string; lines: PrepLine[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const total = lines.length * TASKS.length;
  const done = lines.reduce((s, l) => s + TASKS.filter(([t]) => l.done[t]).length, 0);
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <section className="border border-border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-wider font-semibold">Preparação do produto</h2>
        <span className="text-xs font-semibold">
          {done}/{total} · {pct}%
        </span>
      </div>
      <div className="h-1.5 bg-surface border border-border">
        <div className="h-full bg-foreground" style={{ width: `${pct}%` }} />
      </div>
      {lines.length === 0 ? (
        <p className="text-sm text-muted">Sem linhas ativas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr>
                <th className="p-2">Item</th>
                {TASKS.map(([t, label]) => (
                  <th key={t} className="p-2 text-center">
                    {label}
                    <button type="button" disabled={pending} className="block mx-auto normal-case font-normal underline text-muted" onClick={() => run(() => setPrepTaskForAll(orderId, t, !lines.every((l) => l.done[t])))}>
                      {lines.every((l) => l.done[t]) ? "desmarcar todos" : "marcar todos"}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="p-2">
                    {l.title} <span className="text-muted">{l.detail} × {l.qty}</span>
                  </td>
                  {TASKS.map(([t]) => (
                    <td key={t} className="p-2 text-center">
                      <input type="checkbox" checked={Boolean(l.done[t])} disabled={pending} onChange={(e) => run(() => setPrepTask(orderId, l.id, t, e.target.checked))} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </section>
  );
}
