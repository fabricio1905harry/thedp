"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCategory, deleteSupplierWeight, saveCategory, saveSupplierWeight, type CategoryInput } from "@/app/admin/categorias/actions";

type Dims = { length?: number; width?: number; height?: number } | null;

export interface CategoryRow {
  category: string;
  name_en: string | null;
  name_es: string | null;
  parent_category: string | null;
  ncm: string | null;
  hs_code: string | null;
  weight_g: number | null;
  dims_cm: Dims;
  active: boolean;
  sort: number;
}

export interface SupplierWeightRow {
  category: string;
  connector_id: string;
  weight_g: number | null;
  dims_cm: Dims;
}

const input = "w-full border border-border px-2 py-1.5 text-sm";
const kg = (g: number | null) => (g ? (g / 1000).toFixed(2).replace(".", ",") : "");
const dimsText = (d: Dims) => (d && d.length ? `${d.length} × ${d.width} × ${d.height} cm` : "—");
const ncmText = (n: string | null) => (n ? n.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1.$2.$3") : "—");

function toInput(c: CategoryRow | null): CategoryInput {
  return {
    original: c?.category ?? "",
    name: c?.category ?? "",
    nameEn: c?.name_en ?? "",
    nameEs: c?.name_es ?? "",
    parent: c?.parent_category ?? "",
    ncm: c?.ncm ?? "",
    hs: c?.hs_code?.replace(/\D/g, "").slice(0, 6) ?? "",
    weightKg: kg(c?.weight_g ?? null),
    length: c?.dims_cm?.length ? String(c.dims_cm.length) : "",
    width: c?.dims_cm?.width ? String(c.dims_cm.width) : "",
    height: c?.dims_cm?.height ? String(c.dims_cm.height) : "",
    active: c?.active ?? true,
    sort: String(c?.sort ?? 0),
  };
}

export function CategoriesAdmin({
  categories,
  connectors,
  supplierWeights,
  productCounts,
}: {
  categories: CategoryRow[];
  connectors: { id: string; supplier_name: string }[];
  supplierWeights: SupplierWeightRow[];
  productCounts: Record<string, number>;
}) {
  const [editing, setEditing] = useState<string | null>(null); // category name, "" = new
  const parents = categories.filter((c) => !c.parent_category);
  const ordered = useMemo(() => {
    const out: CategoryRow[] = [];
    for (const p of parents) {
      out.push(p);
      for (const ch of categories.filter((c) => c.parent_category === p.category)) out.push(ch);
    }
    // orphans (parent missing) at the end
    for (const c of categories) if (!out.includes(c)) out.push(c);
    return out;
  }, [categories, parents]);
  const byName = new Map(categories.map((c) => [c.category, c]));

  return (
    <div className="space-y-4">
      <div>
        {editing === "" ? (
          <CategoryForm initial={null} parents={parents} onDone={() => setEditing(null)} />
        ) : (
          <button type="button" onClick={() => setEditing("")} className="bg-foreground text-background text-xs px-4 py-2">
            + Nova categoria
          </button>
        )}
      </div>

      {ordered.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma categoria ainda.</p>
      ) : (
        <div className="overflow-x-auto border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted uppercase border-b border-border bg-surface">
                <th className="py-2 px-3">Categoria</th>
                <th className="py-2 px-3">EN / ES</th>
                <th className="py-2 px-3">NCM</th>
                <th className="py-2 px-3">HS</th>
                <th className="py-2 px-3">Peso</th>
                <th className="py-2 px-3">Medidas (C × L × A)</th>
                <th className="py-2 px-3">Produtos</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((c) => {
                const parent = c.parent_category ? byName.get(c.parent_category) : undefined;
                const inherited = (v: unknown, pv: unknown) => (v ? "" : pv ? " (da mãe)" : "");
                return editing === c.category ? (
                  <tr key={c.category} className="border-b border-border">
                    <td colSpan={8} className="p-3">
                      <CategoryForm initial={c} parents={parents.filter((p) => p.category !== c.category)} onDone={() => setEditing(null)} />
                      <SupplierWeights category={c.category} connectors={connectors} rows={supplierWeights.filter((s) => s.category === c.category)} />
                    </td>
                  </tr>
                ) : (
                  <tr key={c.category} className={`border-b border-border align-top ${c.active ? "" : "text-muted"}`}>
                    <td className="py-2 px-3">
                      <span className={c.parent_category ? "pl-5 before:content-['↳_'] before:text-muted" : "font-medium"}>{c.category}</span>
                      {!c.active && <span className="ml-2 text-[10px] uppercase">inativa</span>}
                    </td>
                    <td className="py-2 px-3 text-xs text-muted">{[c.name_en, c.name_es].filter(Boolean).join(" / ") || "—"}</td>
                    <td className="py-2 px-3 whitespace-nowrap">{ncmText(c.ncm ?? parent?.ncm ?? null)}<span className="text-[11px] text-muted">{inherited(c.ncm, parent?.ncm)}</span></td>
                    <td className="py-2 px-3 whitespace-nowrap">{(c.hs_code || c.ncm?.slice(0, 6) || parent?.hs_code || parent?.ncm?.slice(0, 6)) ?? "—"}</td>
                    <td className="py-2 px-3 whitespace-nowrap">{kg(c.weight_g ?? parent?.weight_g ?? null) ? `${kg(c.weight_g ?? parent?.weight_g ?? null)} kg` : "—"}<span className="text-[11px] text-muted">{inherited(c.weight_g, parent?.weight_g)}</span></td>
                    <td className="py-2 px-3 whitespace-nowrap">{dimsText(c.dims_cm?.length ? c.dims_cm : parent?.dims_cm ?? null)}</td>
                    <td className="py-2 px-3">{productCounts[c.category] ?? 0}</td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => setEditing(c.category)} className="text-xs underline">Editar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CategoryForm({ initial, parents, onDone }: { initial: CategoryRow | null; parents: CategoryRow[]; onDone: () => void }) {
  const router = useRouter();
  const [f, setF] = useState<CategoryInput>(toInput(initial));
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof CategoryInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveCategory(f);
      if (res.error) {
        setMsg({ error: true, text: res.error });
        return;
      }
      setMsg({ error: false, text: `Salvo. ${res.count ?? 0} produto(s) atualizado(s).` });
      router.refresh();
      onDone();
    });
  }
  function remove() {
    if (!initial || !window.confirm(`Excluir a categoria “${initial.category}”?`)) return;
    start(async () => {
      const res = await deleteCategory(initial.category);
      if (res.error) return setMsg({ error: true, text: res.error });
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="border border-border bg-white p-4 space-y-3">
      <h3 className="text-sm font-semibold">{initial ? `Editar “${initial.category}”` : "Nova categoria"}</h3>
      <div className="grid md:grid-cols-4 gap-3 text-xs">
        <label className="space-y-1 md:col-span-2"><span className="text-muted">Nome (PT) — o que aparece no cadastro do produto</span><input className={input} value={f.name} onChange={set("name")} placeholder="Vestidos" /></label>
        <label className="space-y-1"><span className="text-muted">Nome EN</span><input className={input} value={f.nameEn} onChange={set("nameEn")} placeholder="Dresses" /></label>
        <label className="space-y-1"><span className="text-muted">Nome ES</span><input className={input} value={f.nameEs} onChange={set("nameEs")} placeholder="Vestidos" /></label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-muted">Subcategoria de</span>
          <select className={input} value={f.parent} onChange={set("parent")}>
            <option value="">— nenhuma (categoria principal) —</option>
            {parents.map((p) => <option key={p.category} value={p.category}>{p.category}</option>)}
          </select>
        </label>
        <label className="space-y-1"><span className="text-muted">NCM (8 dígitos)</span><input className={input} value={f.ncm} onChange={set("ncm")} placeholder="62044300" inputMode="numeric" /></label>
        <label className="space-y-1"><span className="text-muted">HS (6 dígitos; vazio = 6 primeiros do NCM)</span><input className={input} value={f.hs} onChange={set("hs")} placeholder="620443" inputMode="numeric" /></label>
        <label className="space-y-1"><span className="text-muted">Peso da peça embalada (kg)</span><input className={input} value={f.weightKg} onChange={set("weightKg")} placeholder="1,60" inputMode="decimal" /></label>
        <label className="space-y-1"><span className="text-muted">Comprimento (cm)</span><input className={input} value={f.length} onChange={set("length")} placeholder="36" inputMode="decimal" /></label>
        <label className="space-y-1"><span className="text-muted">Largura (cm)</span><input className={input} value={f.width} onChange={set("width")} placeholder="34" inputMode="decimal" /></label>
        <label className="space-y-1"><span className="text-muted">Altura (cm)</span><input className={input} value={f.height} onChange={set("height")} placeholder="11" inputMode="decimal" /></label>
        <label className="space-y-1"><span className="text-muted">Ordem</span><input className={input} value={f.sort} onChange={set("sort")} inputMode="numeric" /></label>
        <label className="flex items-center gap-2 self-end pb-2"><input type="checkbox" checked={f.active} onChange={set("active")} /> Ativa (aparece no cadastro do produto)</label>
      </div>
      <p className="text-[11px] text-muted">Numa subcategoria, deixe vazio o que deve vir da categoria-mãe.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} onClick={save} className="bg-foreground text-background text-xs px-4 py-2 disabled:opacity-40">{pending ? "Salvando…" : "Salvar"}</button>
        <button type="button" disabled={pending} onClick={onDone} className="text-xs underline">Cancelar</button>
        {initial && <button type="button" disabled={pending} onClick={remove} className="text-xs text-red-700 underline ml-auto">Excluir</button>}
        {msg && <span className={`text-xs ${msg.error ? "text-red-700" : ""}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

function SupplierWeights({ category, connectors, rows }: { category: string; connectors: { id: string; supplier_name: string }[]; rows: SupplierWeightRow[] }) {
  const router = useRouter();
  const [f, setF] = useState({ connectorId: "", weightKg: "", length: "", width: "", height: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const nameOf = new Map(connectors.map((c) => [c.id, c.supplier_name]));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="mt-3 border border-border bg-surface/50 p-4 space-y-2 text-xs">
      <h4 className="font-semibold">Peso e medidas por fornecedor nesta categoria</h4>
      <p className="text-muted">Quando o produto é deste fornecedor, estes valores valem no lugar dos da categoria.</p>
      {rows.length > 0 && (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.connector_id} className="flex flex-wrap items-center gap-3">
              <strong>{nameOf.get(r.connector_id) ?? r.connector_id.slice(0, 8)}</strong>
              <span>{r.weight_g ? `${kg(r.weight_g)} kg` : "—"}</span>
              <span>{dimsText(r.dims_cm)}</span>
              <button
                type="button"
                disabled={pending}
                className="underline text-red-700"
                onClick={() => start(async () => { const res = await deleteSupplierWeight(category, r.connector_id); setMsg(res.error ?? null); router.refresh(); })}
              >
                remover
              </button>
            </li>
          ))}
        </ul>
      )}
      {connectors.length === 0 ? (
        <p className="text-muted">Nenhum fornecedor (conector) cadastrado.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <select className="border border-border px-2 py-1.5" value={f.connectorId} onChange={set("connectorId")}>
            <option value="">Fornecedor…</option>
            {connectors.map((c) => <option key={c.id} value={c.id}>{c.supplier_name}</option>)}
          </select>
          <input className="w-20 border border-border px-2 py-1.5" placeholder="kg" value={f.weightKg} onChange={set("weightKg")} />
          <input className="w-16 border border-border px-2 py-1.5" placeholder="C" value={f.length} onChange={set("length")} />
          <input className="w-16 border border-border px-2 py-1.5" placeholder="L" value={f.width} onChange={set("width")} />
          <input className="w-16 border border-border px-2 py-1.5" placeholder="A" value={f.height} onChange={set("height")} />
          <button
            type="button"
            disabled={pending}
            className="border border-foreground px-3 py-1.5"
            onClick={() =>
              start(async () => {
                const res = await saveSupplierWeight({ category, ...f });
                setMsg(res.error ?? "Salvo.");
                if (!res.error) {
                  setF({ connectorId: "", weightKg: "", length: "", width: "", height: "" });
                  router.refresh();
                }
              })
            }
          >
            Adicionar
          </button>
          {msg && <span>{msg}</span>}
        </div>
      )}
    </div>
  );
}
