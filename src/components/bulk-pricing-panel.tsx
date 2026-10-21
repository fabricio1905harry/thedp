"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { bulkAdjustPrices, type BulkAction } from "@/app/admin/precificacao/actions";

export interface PricedProduct {
  id: string;
  title: string;
  category: string | null;
  status: string;
  original_price: number | null;
  extra_cost_brl: number;
  margin_pct_override: number | null;
  commission_pct_override: number | null;
  price_adjust_pct: number;
  price_brl: number | null;
  price_usd: number | null;
  price_eur: number | null;
  retail_usd: number | null;
  retail_eur: number | null;
}

const ACTIONS: { value: BulkAction["kind"]; label: string; hint: string; allowEmpty?: boolean }[] = [
  { value: "margin", label: "Definir margem %", hint: "Substitui a margem global. Vazio = volta à regra global.", allowEmpty: true },
  { value: "commission", label: "Definir comissão %", hint: "Vazio = volta à regra global.", allowEmpty: true },
  { value: "adjust", label: "Ajuste no preço final %", hint: "Ex.: 10 = +10%, -5 = -5% (aplicado depois da fórmula)." },
  { value: "extra_cost", label: "Custo extra por peça (R$)", hint: "Somado aos custos fixos só destes produtos." },
  { value: "cost_pct", label: "Reajustar custo da peça %", hint: "Altera o custo recebido do fornecedor (ex.: 5 = +5%)." },
  { value: "reset", label: "Voltar tudo à regra global", hint: "Remove margem/comissão/ajuste/custo extra individuais." },
];

export function BulkPricingPanel({
  products,
  categories,
  filter,
  total,
}: {
  products: PricedProduct[];
  categories: string[];
  filter: { category: string; status: string; q: string };
  total: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [kind, setKind] = useState<BulkAction["kind"]>("adjust");
  const [value, setValue] = useState("");
  const [scope, setScope] = useState<"selected" | "filter">("filter");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const def = ACTIONS.find((a) => a.value === kind)!;

  const allChecked = products.length > 0 && selected.length === products.length;

  function apply() {
    setMsg(null);
    let action: BulkAction;
    if (kind === "reset") action = { kind };
    else if ((kind === "margin" || kind === "commission") && value.trim() === "") action = { kind, value: null };
    else {
      const n = Number(value.replace(",", "."));
      if (value.trim() === "" || !Number.isFinite(n)) return setMsg("Informe um número.");
      action = { kind, value: n } as BulkAction;
    }
    const target =
      scope === "selected"
        ? ({ mode: "selected", ids: selected } as const)
        : ({ mode: "filter", category: filter.category || undefined, status: filter.status || undefined, search: filter.q || undefined } as const);
    const count = scope === "selected" ? selected.length : total;
    if (!window.confirm(`Aplicar "${def.label}" em ${count} produto(s)? Os preços serão recalculados.`)) return;
    start(async () => {
      const res = await bulkAdjustPrices(target, action);
      setMsg(res.error ?? `${res.count} produto(s) atualizados e recalculados.`);
      setSelected([]);
      router.refresh();
    });
  }

  const fmt = (n: number | null, prefix = "") => (n === null || n === undefined ? "—" : `${prefix}${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={filter.q} placeholder="Buscar produto…" className="border border-border px-3 py-1.5 w-56" />
        <select name="category" defaultValue={filter.category} className="border border-border px-3 py-1.5">
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select name="status" defaultValue={filter.status} className="border border-border px-3 py-1.5">
          <option value="">Todos os status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <button className="bg-foreground text-background px-4 py-1.5">Filtrar</button>
        <span className="self-center text-xs text-muted">{total} produto(s) no filtro</span>
      </form>

      <div className="border border-border p-4 space-y-3 bg-surface/40">
        <div className="flex flex-wrap gap-3 items-end text-sm">
          <label className="space-y-1 text-xs">
            <span>Ação</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as BulkAction["kind"])} className="block border border-border px-3 py-1.5 text-sm bg-background">
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </label>
          {kind !== "reset" && (
            <label className="space-y-1 text-xs">
              <span>Valor</span>
              <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={def.allowEmpty ? "vazio = global" : "0"} className="block border border-border px-3 py-1.5 w-32 text-sm bg-background" />
            </label>
          )}
          <label className="space-y-1 text-xs">
            <span>Aplicar em</span>
            <select value={scope} onChange={(e) => setScope(e.target.value as "selected" | "filter")} className="block border border-border px-3 py-1.5 text-sm bg-background">
              <option value="filter">Todos do filtro ({total})</option>
              <option value="selected">Selecionados ({selected.length})</option>
            </select>
          </label>
          <button onClick={apply} disabled={pending || (scope === "selected" && selected.length === 0)} className="bg-foreground text-background px-5 py-1.5 disabled:opacity-50">
            {pending ? "Aplicando…" : "Aplicar"}
          </button>
        </div>
        <p className="text-xs text-muted">{def.hint}</p>
        {msg && <p className="text-xs font-medium">{msg}</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left border-b border-border">
              <th className="py-2 pr-2">
                <input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? [] : products.map((p) => p.id))} aria-label="Selecionar todos" />
              </th>
              <th className="py-2 pr-3">Produto</th>
              <th className="py-2 pr-3 text-right">Custo R$</th>
              <th className="py-2 pr-3">Individual</th>
              <th className="py-2 pr-3 text-right">PV R$</th>
              <th className="py-2 pr-3 text-right">USD</th>
              <th className="py-2 pr-3 text-right">EUR</th>
              <th className="py-2 pr-3 text-right">Retail USD</th>
              <th className="py-2 text-right">Retail EUR</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const overrides = [
                p.margin_pct_override !== null && `margem ${p.margin_pct_override}%`,
                p.commission_pct_override !== null && `comissão ${p.commission_pct_override}%`,
                Number(p.price_adjust_pct) !== 0 && `ajuste ${p.price_adjust_pct}%`,
                Number(p.extra_cost_brl) !== 0 && `+R$ ${p.extra_cost_brl}`,
              ].filter(Boolean);
              return (
                <tr key={p.id} className="border-b border-border">
                  <td className="py-2 pr-2">
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={() => setSelected((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]))}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Link href={`/admin/produtos/${p.id}`} className="hover:underline">{p.title}</Link>
                    <span className="block text-muted">{p.category ?? "—"} · {p.status}</span>
                  </td>
                  <td className="py-2 pr-3 text-right">{fmt(p.original_price)}</td>
                  <td className="py-2 pr-3">{overrides.length ? <span className="font-medium">{overrides.join(" · ")}</span> : <span className="text-muted">regra global</span>}</td>
                  <td className="py-2 pr-3 text-right">{fmt(p.price_brl)}</td>
                  <td className="py-2 pr-3 text-right font-semibold">{fmt(p.price_usd)}</td>
                  <td className="py-2 pr-3 text-right font-semibold">{fmt(p.price_eur)}</td>
                  <td className="py-2 pr-3 text-right">{fmt(p.retail_usd)}</td>
                  <td className="py-2 text-right">{fmt(p.retail_eur)}</td>
                </tr>
              );
            })}
            {products.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-muted">Nenhum produto.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {total > products.length && <p className="text-xs text-muted">Mostrando {products.length} de {total}. “Todos do filtro” aplica nos {total}.</p>}
    </div>
  );
}
