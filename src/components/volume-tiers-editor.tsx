"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createTier,
  deleteTier,
  setTierActive,
  setVolumePricingEnabled,
  type ActionResult,
  type TierInput,
} from "@/app/admin/volume-pricing/actions";

export interface TierRow {
  id: string;
  name: string;
  operation: string | null;
  category: string | null;
  min_qty: number;
  max_qty: number | null;
  discount_pct: number;
  active: boolean;
  margin_pct?: number | null;
}

const EMPTY: TierInput = { name: "", operation: "", category: "", minQty: 6, maxQty: null, discountPct: 5, active: true };

export function VolumeTiersEditor({
  enabled,
  targetPct,
  tiers,
  channels,
  categories,
}: {
  enabled: boolean;
  targetPct: number | null;
  tiers: TierRow[];
  channels: { code: string; name: string }[];
  categories: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<TierInput>(EMPTY);
  const channelName = (code: string | null) => (code ? (channels.find((c) => c.code === code)?.name ?? code) : "Todas");

  function run(fn: () => Promise<ActionResult>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) return setError(res.error);
      after?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600 border border-red-300 p-2">{error}</p>}

      <section className="border border-border p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <p className="font-medium">
            Volume Pricing:{" "}
            <span className={enabled ? "text-emerald-700" : "text-muted"}>{enabled ? "LIGADO" : "DESLIGADO"}</span>
          </p>
          <p className="text-xs text-muted">
            Meta de margem usada na checagem: {targetPct !== null ? `${targetPct}%` : "—"} (Admin → Pagamentos → “Meta de margem %”, ou a
            margem da regra de precificação).
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!enabled && !window.confirm("Ligar o Volume Pricing? Os descontos passam a valer no carrinho e nos novos pedidos.")) return;
            run(() => setVolumePricingEnabled(!enabled));
          }}
          className={enabled ? "border border-foreground px-3 py-1.5 text-xs" : "btn-primary px-3 py-1.5 text-xs"}
        >
          {enabled ? "Desligar" : "Ligar Volume Pricing"}
        </button>
      </section>

      <section className="border border-border p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide mb-3">Faixas</h2>
        {tiers.length === 0 ? (
          <p className="text-xs text-muted">Nenhuma faixa cadastrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-1 pr-3">Nome</th>
                  <th className="py-1 pr-3">Operação</th>
                  <th className="py-1 pr-3">Categoria</th>
                  <th className="py-1 pr-3">Quantidade</th>
                  <th className="py-1 pr-3">Desconto</th>
                  <th className="py-1 pr-3">Margem resultante</th>
                  <th className="py-1 pr-3">Ativa</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {tiers.map((t) => {
                  const below = t.margin_pct !== null && t.margin_pct !== undefined && targetPct !== null && t.margin_pct < targetPct;
                  return (
                    <tr key={t.id} className="border-b border-border">
                      <td className="py-1.5 pr-3 font-medium">{t.name}</td>
                      <td className="py-1.5 pr-3">{channelName(t.operation)}</td>
                      <td className="py-1.5 pr-3">{t.category ?? "Carrinho todo"}</td>
                      <td className="py-1.5 pr-3">
                        {t.min_qty}
                        {t.max_qty === null ? "+" : `–${t.max_qty}`} pç
                      </td>
                      <td className="py-1.5 pr-3">{Number(t.discount_pct)}%</td>
                      <td className={`py-1.5 pr-3 ${below ? "text-red-700 font-semibold" : ""}`}>
                        {t.margin_pct !== null && t.margin_pct !== undefined ? `${t.margin_pct}%` : "—"}
                        {below && <span className="block">abaixo da meta ({targetPct}%)</span>}
                      </td>
                      <td className="py-1.5 pr-3">
                        <input type="checkbox" checked={t.active} disabled={pending} onChange={(e) => run(() => setTierActive(t.id, e.target.checked))} />
                      </td>
                      <td className="py-1.5 text-right">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            if (window.confirm(`Excluir a faixa “${t.name}”?`)) run(() => deleteTier(t.id));
                          }}
                          className="underline text-red-700"
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="border border-border p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide mb-3">Nova faixa</h2>
        <form
          className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => createTier(form), () => setForm(EMPTY));
          }}
        >
          <label className="flex flex-col col-span-2">
            Nome
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: 12+ vestidos" className="border border-border px-2 py-1" />
          </label>
          <label className="flex flex-col">
            Operação
            <select value={form.operation} onChange={(e) => setForm({ ...form, operation: e.target.value })} className="border border-border px-2 py-1">
              <option value="">Todas</option>
              {channels.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col">
            Categoria
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="border border-border px-2 py-1">
              <option value="">Carrinho todo</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col">
            Quantidade mínima
            <input type="number" min="1" step="1" value={form.minQty || ""} onChange={(e) => setForm({ ...form, minQty: Number(e.target.value) })} className="border border-border px-2 py-1" />
          </label>
          <label className="flex flex-col">
            Quantidade máxima (vazio = sem limite)
            <input
              type="number"
              min="1"
              step="1"
              value={form.maxQty ?? ""}
              onChange={(e) => setForm({ ...form, maxQty: e.target.value === "" ? null : Number(e.target.value) })}
              className="border border-border px-2 py-1"
            />
          </label>
          <label className="flex flex-col">
            Desconto (%)
            <input type="number" min="0" max="90" step="0.5" value={form.discountPct || ""} onChange={(e) => setForm({ ...form, discountPct: Number(e.target.value) })} className="border border-border px-2 py-1" />
          </label>
          <div className="flex items-end justify-end">
            <button type="submit" disabled={pending} className="btn-primary px-4 py-2">
              {pending ? "Salvando…" : "Adicionar faixa"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
