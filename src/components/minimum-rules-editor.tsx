"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createMinimumRule,
  deleteMinimumRule,
  setMinimumRuleActive,
  type ActionResult,
  type MinimumRuleInput,
} from "@/app/admin/pedido-minimo/actions";

export interface MinimumRuleRow {
  id: string;
  name: string;
  operation: string | null;
  scope: "operation" | "category" | "brand" | "product";
  scope_value: string | null;
  scope_label?: string | null;
  min_type: "amount" | "units";
  min_value: number;
  currency: string;
  active: boolean;
}

const SCOPE_LABELS: Record<string, string> = {
  operation: "Toda a operação",
  category: "Categoria",
  brand: "Marca",
  product: "Produto",
};

const EMPTY: MinimumRuleInput = {
  name: "",
  operation: "",
  scope: "operation",
  scopeValue: "",
  minType: "units",
  minValue: 0,
  currency: "USD",
  active: false,
  labels: { en: "", es: "", pt: "" },
  message: { en: "", es: "", pt: "" },
};

export function MinimumRulesEditor({
  rules,
  channels,
  categories,
  brands,
}: {
  rules: MinimumRuleRow[];
  channels: { code: string; name: string }[];
  categories: string[];
  brands: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<MinimumRuleInput>(EMPTY);
  const channelName = (code: string | null) => (code ? (channels.find((c) => c.code === code)?.name ?? code) : "Todas as operações");

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

      <section className="border border-border p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide mb-3">Regras cadastradas</h2>
        {rules.length === 0 ? (
          <p className="text-xs text-muted">Nenhuma regra — não há pedido mínimo (padrão do lançamento).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-1 pr-3">Nome</th>
                  <th className="py-1 pr-3">Operação</th>
                  <th className="py-1 pr-3">Aplica-se a</th>
                  <th className="py-1 pr-3">Mínimo</th>
                  <th className="py-1 pr-3">Ativa</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className="border-b border-border">
                    <td className="py-1.5 pr-3 font-medium">{r.name}</td>
                    <td className="py-1.5 pr-3">{channelName(r.operation)}</td>
                    <td className="py-1.5 pr-3">
                      {SCOPE_LABELS[r.scope]}
                      {r.scope !== "operation" && r.scope_label ? `: ${r.scope_label}` : ""}
                    </td>
                    <td className="py-1.5 pr-3">
                      {r.min_type === "units"
                        ? `${Number(r.min_value)} unidades`
                        : `${Number(r.min_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ${r.currency}`}
                    </td>
                    <td className="py-1.5 pr-3">
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={r.active}
                          disabled={pending}
                          onChange={(e) => run(() => setMinimumRuleActive(r.id, e.target.checked))}
                        />
                        {r.active ? "LIGADA" : "desligada"}
                      </label>
                    </td>
                    <td className="py-1.5 text-right">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (window.confirm(`Excluir a regra “${r.name}”?`)) run(() => deleteMinimumRule(r.id));
                        }}
                        className="underline text-red-700"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="border border-border p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide mb-3">Nova regra</h2>
        <form
          className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => createMinimumRule(form), () => setForm(EMPTY));
          }}
        >
          <label className="flex flex-col col-span-2">
            Nome da regra
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Mínimo de 6 vestidos (B2B internacional)" className="border border-border px-2 py-1" />
          </label>
          <label className="flex flex-col">
            Operação
            <select value={form.operation} onChange={(e) => setForm({ ...form, operation: e.target.value })} className="border border-border px-2 py-1">
              <option value="">Todas as operações</option>
              {channels.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col">
            Aplica-se a
            <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as MinimumRuleInput["scope"], scopeValue: "" })} className="border border-border px-2 py-1">
              {Object.entries(SCOPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          {form.scope === "category" && (
            <label className="flex flex-col col-span-2">
              Categoria
              <select value={form.scopeValue} onChange={(e) => setForm({ ...form, scopeValue: e.target.value })} className="border border-border px-2 py-1">
                <option value="">Selecione…</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          {form.scope === "brand" && (
            <label className="flex flex-col col-span-2">
              Marca
              <select value={form.scopeValue} onChange={(e) => setForm({ ...form, scopeValue: e.target.value })} className="border border-border px-2 py-1">
                <option value="">Selecione…</option>
                {brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </label>
          )}
          {form.scope === "product" && (
            <label className="flex flex-col col-span-2">
              Slug do produto
              <input value={form.scopeValue} onChange={(e) => setForm({ ...form, scopeValue: e.target.value })} placeholder="slug-do-produto" className="border border-border px-2 py-1" />
            </label>
          )}

          <label className="flex flex-col">
            Tipo de mínimo
            <select value={form.minType} onChange={(e) => setForm({ ...form, minType: e.target.value as "amount" | "units" })} className="border border-border px-2 py-1">
              <option value="units">Unidades (peças)</option>
              <option value="amount">Valor</option>
            </select>
          </label>
          <label className="flex flex-col">
            Mínimo {form.minType === "units" ? "(peças)" : "(valor)"}
            <input type="number" min="0" step={form.minType === "units" ? "1" : "0.01"} value={form.minValue || ""} onChange={(e) => setForm({ ...form, minValue: Number(e.target.value) })} className="border border-border px-2 py-1" />
          </label>
          {form.minType === "amount" && (
            <label className="flex flex-col">
              Moeda do mínimo
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as MinimumRuleInput["currency"] })} className="border border-border px-2 py-1">
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="BRL">BRL</option>
              </select>
            </label>
          )}

          <details className="col-span-2 md:col-span-4 border border-border p-2">
            <summary className="cursor-pointer font-medium">Textos para o comprador (opcional)</summary>
            <p className="text-muted my-2">
              Nome exibido de categoria/marca/produto no aviso do carrinho (ex.: “Dresses”) e, se quiser, uma mensagem própria.
              Use <code>{"{missing}"}</code> para o valor ou as unidades que faltam. Em branco = texto padrão traduzido.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(["en", "es", "pt"] as const).map((lang) => (
                <div key={lang} className="space-y-2">
                  <label className="flex flex-col">
                    Nome exibido ({lang.toUpperCase()})
                    <input value={form.labels[lang]} onChange={(e) => setForm({ ...form, labels: { ...form.labels, [lang]: e.target.value } })} className="border border-border px-2 py-1" />
                  </label>
                  <label className="flex flex-col">
                    Mensagem ({lang.toUpperCase()})
                    <input value={form.message[lang]} onChange={(e) => setForm({ ...form, message: { ...form.message, [lang]: e.target.value } })} placeholder="Add {missing} more Dresses to place your order" className="border border-border px-2 py-1" />
                  </label>
                </div>
              ))}
            </div>
          </details>

          <label className="flex items-center gap-2 col-span-2">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Criar já ligada (padrão: desligada)
          </label>
          <div className="col-span-2 flex justify-end items-end">
            <button type="submit" disabled={pending} className="btn-primary px-4 py-2">
              {pending ? "Salvando…" : "Adicionar regra"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
