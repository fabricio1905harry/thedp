"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteDutiesRule,
  saveDutiesRule,
  setDutiesRuleActive,
  type ActionResult,
  type DutiesRuleInput,
} from "@/app/admin/impostos/actions";
import { DUTIES_MODES, DUTIES_MODE_LABELS_PT, REGIONS, type DutiesRule } from "@/lib/duties";

const EMPTY: DutiesRuleInput = { marketType: "country", market: "", mode: "prepaid", defaultPct: null, note: "", active: true };

const MARKET_TYPE_LABELS = { country: "País", region: "Região", default: "Padrão (demais mercados)" } as const;

export function DutiesRulesEditor({ rules }: { rules: DutiesRule[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<DutiesRuleInput>(EMPTY);

  function run(fn: () => Promise<ActionResult>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) return setError(res.error);
      after?.();
      router.refresh();
    });
  }

  const marketLabel = (r: DutiesRule) =>
    r.market_type === "default" ? "Todos os demais" : r.market_type === "region" ? (REGIONS[r.market]?.label ?? r.market) : r.market;

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600 border border-red-300 p-2">{error}</p>}

      <section className="border border-border p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide mb-3">Regras por mercado</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="py-1 pr-3">Tipo</th>
                <th className="py-1 pr-3">Mercado</th>
                <th className="py-1 pr-3">Modo</th>
                <th className="py-1 pr-3">% padrão</th>
                <th className="py-1 pr-3">Observação</th>
                <th className="py-1 pr-3">Ativa</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-b border-border">
                  <td className="py-1.5 pr-3">{MARKET_TYPE_LABELS[r.market_type]}</td>
                  <td className="py-1.5 pr-3 font-medium">{marketLabel(r)}</td>
                  <td className="py-1.5 pr-3">{DUTIES_MODE_LABELS_PT[r.mode]}</td>
                  <td className="py-1.5 pr-3">{r.default_pct === null ? "—" : `${r.default_pct}%`}</td>
                  <td className="py-1.5 pr-3 max-w-[16rem]">{r.note ?? ""}</td>
                  <td className="py-1.5 pr-3">
                    <input type="checkbox" checked={r.active} disabled={pending} onChange={(e) => run(() => setDutiesRuleActive(r.id, e.target.checked))} />
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="underline mr-3"
                      onClick={() =>
                        setForm({
                          marketType: r.market_type,
                          market: r.market,
                          mode: r.mode,
                          defaultPct: r.default_pct,
                          note: r.note ?? "",
                          active: r.active,
                        })
                      }
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm("Excluir esta regra?")) run(() => deleteDutiesRule(r.id));
                      }}
                      className="underline text-red-700"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-2 text-muted">
                    Nenhuma regra. Sem regra, o campo de impostos do pedido começa vazio.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border border-border p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide mb-1">Adicionar / alterar regra</h2>
        <p className="text-[11px] text-muted mb-3">Já existe uma regra para o mercado escolhido? Ela é substituída.</p>
        <form
          className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveDutiesRule(form), () => setForm(EMPTY));
          }}
        >
          <label className="flex flex-col">
            Tipo de mercado
            <select
              value={form.marketType}
              onChange={(e) => setForm({ ...form, marketType: e.target.value as DutiesRuleInput["marketType"], market: "" })}
              className="border border-border px-2 py-1"
            >
              {Object.entries(MARKET_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          {form.marketType === "country" && (
            <label className="flex flex-col">
              País (código de 2 letras)
              <input value={form.market} maxLength={2} onChange={(e) => setForm({ ...form, market: e.target.value.toUpperCase() })} placeholder="US" className="border border-border px-2 py-1" />
            </label>
          )}
          {form.marketType === "region" && (
            <label className="flex flex-col">
              Região
              <select value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })} className="border border-border px-2 py-1">
                <option value="">Selecione…</option>
                {Object.entries(REGIONS).map(([k, r]) => (
                  <option key={k} value={k}>{r.label}</option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col col-span-2">
            Modo
            <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as DutiesRuleInput["mode"] })} className="border border-border px-2 py-1">
              {DUTIES_MODES.map((m) => (
                <option key={m} value={m}>{DUTIES_MODE_LABELS_PT[m]}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col">
            % padrão sobre a mercadoria
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={form.defaultPct ?? ""}
              onChange={(e) => setForm({ ...form, defaultPct: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder="vazio = sem sugestão"
              className="border border-border px-2 py-1"
            />
          </label>
          <label className="flex flex-col col-span-2">
            Observação (interna)
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="border border-border px-2 py-1" />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Ativa
          </label>
          <div className="flex items-end justify-end">
            <button type="submit" disabled={pending} className="btn-primary px-4 py-2">
              {pending ? "Salvando…" : "Salvar regra"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
