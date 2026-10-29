"use client";

import Link from "next/link";
import { useState } from "react";
import {
  applyCategoryDefaults,
  approveProductShipping,
  deleteCategoryDefault,
  deleteHsRule,
  saveCategoryDefault,
  saveHsRule,
  saveHsCode,
  type Dims,
} from "@/app/admin/ncm/actions";
import { Msg, btnCls, btnGhost, inputCls, useRun } from "@/components/admin-ui";

interface Code {
  code: string;
  description: string;
  default_weight_g: number | null;
  default_dims_cm: Partial<Record<keyof Dims, number>> | null;
  country_origin: string;
  validated: boolean;
  active: boolean;
  notes: string | null;
}
interface CatDefault {
  category: string;
  hs_code: string | null;
  weight_g: number | null;
  dims_cm: Partial<Record<keyof Dims, number>> | null;
}
interface Rule {
  id: string;
  category: string;
  composition_label: string;
  hs_code: string | null;
  weight_g: number | null;
  dims_cm: Partial<Record<keyof Dims, number>> | null;
  notes: string | null;
}
interface ReviewProduct {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  composition?: string | null;
  hs_code: string | null;
  weight_g: number | null;
  dims_cm: Partial<Record<keyof Dims, number>> | null;
  shipping_inherited: string[] | null;
}

const dimsOf = (d: Partial<Record<keyof Dims, number>> | null): Dims => ({
  length: d?.length ? String(d.length) : "",
  width: d?.width ? String(d.width) : "",
  height: d?.height ? String(d.height) : "",
});

function DimsInputs({ value, onChange }: { value: Dims; onChange: (d: Dims) => void }) {
  return (
    <div className="flex gap-1">
      {(["length", "width", "height"] as const).map((k) => (
        <input key={k} value={value[k]} placeholder={k === "length" ? "C" : k === "width" ? "L" : "A"} title={k === "length" ? "Comprimento (cm)" : k === "width" ? "Largura (cm)" : "Altura (cm)"} onChange={(e) => onChange({ ...value, [k]: e.target.value })} className={`${inputCls} w-14`} />
      ))}
    </div>
  );
}

export function NcmAdmin({
  tab,
  codes,
  defaults,
  categories,
  review,
  rules = [],
}: {
  tab: string;
  codes: Code[];
  defaults: CatDefault[];
  categories: string[];
  review: ReviewProduct[];
  rules?: Rule[];
}) {
  if (tab === "mestre") return <MasterTab codes={codes} />;
  if (tab === "regras") return <RulesTab rules={rules} codes={codes} categories={categories} />;
  if (tab === "categorias") return <CategoriesTab codes={codes} defaults={defaults} categories={categories} />;
  return <ReviewTab review={review} />;
}

const FIELD_LABEL: Record<string, string> = { hs_code: "NCM/HS", weight_g: "peso", dims_cm: "dimensões", composition: "composição nova (sem regra)" };

function ReviewTab({ review }: { review: ReviewProduct[] }) {
  return (
    <div className="space-y-3">
      {review.length === 0 && <p className="text-sm text-muted border border-dashed border-border p-6">Nenhum produto aguardando revisão.</p>}
      {review.map((p) => (
        <ReviewRow key={p.id} p={p} />
      ))}
    </div>
  );
}

function ReviewRow({ p }: { p: ReviewProduct }) {
  const { pending, message, run } = useRun();
  const [hs, setHs] = useState(p.hs_code ?? "");
  const [weight, setWeight] = useState(p.weight_g ? String(p.weight_g) : "");
  const [dims, setDims] = useState(dimsOf(p.dims_cm));
  const [saveAsRule, setSaveAsRule] = useState(false);
  const canRule = Boolean(p.category && p.composition);
  return (
    <div className="border border-border p-3 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[12rem]">
        <Link href={`/admin/produtos/${p.id}`} className="font-medium underline">{p.title}</Link>
        <p className="text-xs text-muted">
          {p.category ?? "sem categoria"}{p.composition ? ` · ${p.composition}` : " · sem composição"} · pendente: {(p.shipping_inherited ?? []).map((f) => FIELD_LABEL[f] ?? f).join(", ")}
        </p>
      </div>
      <input value={hs} onChange={(e) => setHs(e.target.value)} placeholder="NCM/HS" className={`${inputCls} w-32`} />
      <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Peso (g)" className={`${inputCls} w-24`} />
      <DimsInputs value={dims} onChange={setDims} />
      <label className={`text-xs flex items-center gap-1 ${canRule ? "" : "opacity-50"}`} title={canRule ? "" : "Preencha categoria e composição no produto"}>
        <input type="checkbox" disabled={!canRule} checked={saveAsRule} onChange={(e) => setSaveAsRule(e.target.checked)} /> salvar como nova regra
      </label>
      <button disabled={pending} className={btnCls} onClick={() => run(() => approveProductShipping({ productId: p.id, hs_code: hs, weight, dims, saveAsRule }), "Aprovado.")}>
        Aprovar
      </button>
      <Msg message={message} />
    </div>
  );
}

function CategoriesTab({ codes, defaults, categories }: { codes: Code[]; defaults: CatDefault[]; categories: string[] }) {
  const { pending, message, run } = useRun();
  const byCat = new Map(defaults.map((d) => [d.category, d]));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          disabled={pending}
          className={btnGhost}
          onClick={() => run(async () => { const r = await applyCategoryDefaults(); return r; }, "Padrões aplicados aos produtos sem dados (veja a aba Revisão).")}
        >
          Aplicar padrões aos produtos sem dados
        </button>
        <Msg message={message} />
      </div>
      {categories.map((c) => (
        <CategoryRow key={c} category={c} initial={byCat.get(c)} codes={codes} />
      ))}
      {categories.length === 0 && <p className="text-sm text-muted">Nenhuma categoria encontrada nos produtos.</p>}
    </div>
  );
}

function CategoryRow({ category, initial, codes }: { category: string; initial?: CatDefault; codes: Code[] }) {
  const { pending, message, run } = useRun();
  const [hs, setHs] = useState(initial?.hs_code ?? "");
  const [weight, setWeight] = useState(initial?.weight_g ? String(initial.weight_g) : "");
  const [dims, setDims] = useState(dimsOf(initial?.dims_cm ?? null));
  return (
    <div className="border border-border p-3 flex flex-wrap items-center gap-3">
      <strong className="w-40">{category}</strong>
      <select value={hs} onChange={(e) => setHs(e.target.value)} className={`${inputCls} w-72`}>
        <option value="">— sem NCM padrão —</option>
        {codes.filter((c) => c.active).map((c) => (
          <option key={c.code} value={c.code}>{c.code} — {c.description.slice(0, 50)}</option>
        ))}
      </select>
      <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Peso (g)" className={`${inputCls} w-24`} />
      <DimsInputs value={dims} onChange={setDims} />
      <button disabled={pending} className={btnCls} onClick={() => run(() => saveCategoryDefault({ category, hs_code: hs, weight, dims }), "Salvo.")}>Salvar</button>
      {initial && (
        <button disabled={pending} className={btnGhost} onClick={() => run(() => deleteCategoryDefault(category), "Padrão removido.")}>Remover</button>
      )}
      <Msg message={message} />
    </div>
  );
}

function MasterTab({ codes }: { codes: Code[] }) {
  const blank: Code = { code: "", description: "", default_weight_g: null, default_dims_cm: null, country_origin: "BR", validated: false, active: true, notes: "" };
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">Códigos sugeridos vêm como “não validados” até a contabilidade confirmar.</p>
      {codes.map((c) => <CodeRow key={c.code} initial={c} />)}
      <h2 className="text-sm font-semibold pt-2">Adicionar código</h2>
      <CodeRow initial={blank} isNew />
    </div>
  );
}

function CodeRow({ initial, isNew }: { initial: Code; isNew?: boolean }) {
  const { pending, message, run } = useRun();
  const [c, setC] = useState({
    code: initial.code,
    description: initial.description,
    weight: initial.default_weight_g ? String(initial.default_weight_g) : "",
    dims: dimsOf(initial.default_dims_cm),
    country: initial.country_origin,
    validated: initial.validated,
    active: initial.active,
    notes: initial.notes ?? "",
  });
  return (
    <div className="border border-border p-3 space-y-2">
      <div className="grid md:grid-cols-[10rem_1fr_6rem_8rem] gap-2">
        <input value={c.code} disabled={!isNew} placeholder="NCM/HS" onChange={(e) => setC({ ...c, code: e.target.value })} className={inputCls} />
        <input value={c.description} placeholder="Descrição" onChange={(e) => setC({ ...c, description: e.target.value })} className={inputCls} />
        <input value={c.country} placeholder="País (BR)" onChange={(e) => setC({ ...c, country: e.target.value })} className={inputCls} />
        <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={c.validated} onChange={(e) => setC({ ...c, validated: e.target.checked })} /> validado</label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input value={c.weight} placeholder="Peso padrão (g)" onChange={(e) => setC({ ...c, weight: e.target.value })} className={`${inputCls} w-32`} />
        <DimsInputs value={c.dims} onChange={(dims) => setC({ ...c, dims })} />
        <input value={c.notes} placeholder="Observações" onChange={(e) => setC({ ...c, notes: e.target.value })} className={`${inputCls} flex-1 min-w-[10rem]`} />
        <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={c.active} onChange={(e) => setC({ ...c, active: e.target.checked })} /> ativo</label>
        <button disabled={pending} className={btnCls} onClick={() => run(() => saveHsCode({ ...c, isNew: Boolean(isNew) }), "Salvo.")}>{isNew ? "Adicionar" : "Salvar"}</button>
        <Msg message={message} />
      </div>
    </div>
  );
}

function RulesTab({ rules, codes, categories }: { rules: Rule[]; codes: Code[]; categories: string[] }) {
  const blank: Rule = { id: "", category: categories[0] ?? "", composition_label: "", hs_code: null, weight_g: null, dims_cm: null, notes: "" };
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Uma regra vale para uma categoria + composição (ex.: Vestidos + 100% viscose). A ordem de herança de um produto é: valores próprios → regra da
        composição → padrão da categoria. Composições escritas de formas diferentes (“95% viscose 5% elastano” = “elastano 5%, viscose 95%”) contam como a mesma.
        Um produto cuja composição ainda não tem regra entra na aba Revisão.
      </p>
      {rules.map((r) => <RuleRow key={r.id} initial={r} codes={codes} categories={categories} />)}
      <h2 className="text-sm font-semibold pt-2">Nova regra</h2>
      <RuleRow initial={blank} codes={codes} categories={categories} isNew />
    </div>
  );
}

function RuleRow({ initial, codes, categories, isNew }: { initial: Rule; codes: Code[]; categories: string[]; isNew?: boolean }) {
  const { pending, message, run } = useRun();
  const [r, setR] = useState({
    category: initial.category,
    composition: initial.composition_label,
    hs_code: initial.hs_code ?? "",
    weight: initial.weight_g ? String(initial.weight_g) : "",
    dims: dimsOf(initial.dims_cm),
    notes: initial.notes ?? "",
  });
  return (
    <div className="border border-border p-3 flex flex-wrap items-center gap-3">
      <input list="ncm-rule-categories" value={r.category} onChange={(e) => setR({ ...r, category: e.target.value })} placeholder="Categoria" className={`${inputCls} w-36`} />
      <datalist id="ncm-rule-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      <input value={r.composition} onChange={(e) => setR({ ...r, composition: e.target.value })} placeholder="Composição (ex.: 100% viscose)" className={`${inputCls} w-56`} />
      <select value={r.hs_code} onChange={(e) => setR({ ...r, hs_code: e.target.value })} className={`${inputCls} w-64`}>
        <option value="">— NCM/HS —</option>
        {codes.filter((c) => c.active).map((c) => (
          <option key={c.code} value={c.code}>{c.code} — {c.description.slice(0, 40)}</option>
        ))}
      </select>
      <input value={r.weight} onChange={(e) => setR({ ...r, weight: e.target.value })} placeholder="Peso (g)" className={`${inputCls} w-24`} />
      <DimsInputs value={r.dims} onChange={(dims) => setR({ ...r, dims })} />
      <button disabled={pending} className={btnCls} onClick={() => run(() => saveHsRule(r), isNew ? "Regra criada." : "Salvo.")}>{isNew ? "Adicionar" : "Salvar"}</button>
      {!isNew && <button disabled={pending} className={btnGhost} onClick={() => run(() => deleteHsRule(initial.id), "Regra removida.")}>Remover</button>}
      <Msg message={message} />
    </div>
  );
}
