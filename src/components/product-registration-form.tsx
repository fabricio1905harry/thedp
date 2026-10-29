"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProductRegistration } from "@/app/admin/produtos/actions";

export interface RegistrationData {
  id: string;
  description: string | null;
  description_en: string | null;
  description_es: string | null;
  composition: string | null;
  origin_country: string | null;
  ncm: string | null;
  hs_code: string | null;
  supplier_ref: string | null;
  tdp_ref: string | null;
  customs_description: string | null;
  visible_ops: string[] | null;
}

const OPS: [string, string][] = [
  ["intl_b2b", "Internacional B2B"],
  ["intl_b2c", "Internacional B2C"],
  ["br_b2b", "Brasil B2B"],
  ["br_b2c", "Brasil B2C"],
];

/** Complete product registration: descriptions, composition, origin, NCM, references, customs text, visibility. */
export function ProductRegistrationForm({ product }: { product: RegistrationData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [f, setF] = useState({
    description: product.description ?? "",
    descriptionEn: product.description_en ?? "",
    descriptionEs: product.description_es ?? "",
    composition: product.composition ?? "",
    originCountry: product.origin_country ?? "BR",
    ncm: product.ncm ?? "",
    supplierRef: product.supplier_ref ?? "",
    tdpRef: product.tdp_ref ?? "",
    customsDescription: product.customs_description ?? "",
    visibleOps: product.visible_ops ?? OPS.map(([k]) => k),
  });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const box = "w-full border border-border px-3 py-2 text-sm";
  const hs6 = f.ncm.replace(/\D/g, "").slice(0, 6) || (product.hs_code ?? "").replace(/\D/g, "").slice(0, 6);

  function save() {
    setMsg(null);
    start(async () => {
      const res = await updateProductRegistration(product.id, f);
      setMsg(res && "error" in res ? res.error : "Cadastro salvo.");
      router.refresh();
    });
  }

  return (
    <section className="border border-border p-4 space-y-4 my-8 max-w-3xl">
      <h2 className="text-sm font-medium uppercase tracking-wide">Cadastro completo do produto</h2>

      <div className="grid md:grid-cols-3 gap-3 text-xs">
        <label className="space-y-1 md:col-span-3">
          <span>Descrição (PT)</span>
          <textarea rows={3} className={box} value={f.description} onChange={(e) => set("description", e.target.value)} />
        </label>
        <label className="space-y-1 md:col-span-3">
          <span>Descrição (EN)</span>
          <textarea rows={3} className={box} value={f.descriptionEn} onChange={(e) => set("descriptionEn", e.target.value)} />
        </label>
        <label className="space-y-1 md:col-span-3">
          <span>Descripción (ES)</span>
          <textarea rows={3} className={box} value={f.descriptionEs} onChange={(e) => set("descriptionEs", e.target.value)} />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span>Material / composição (ex.: 100% viscose)</span>
          <input className={box} value={f.composition} onChange={(e) => set("composition", e.target.value)} />
        </label>
        <label className="space-y-1">
          <span>País de origem (2 letras)</span>
          <input className={box} maxLength={2} value={f.originCountry} onChange={(e) => set("originCountry", e.target.value)} />
        </label>
        <label className="space-y-1">
          <span>NCM (8 dígitos){hs6 ? ` — HS: ${hs6}` : ""}</span>
          <input className={box} inputMode="numeric" value={f.ncm} onChange={(e) => set("ncm", e.target.value)} placeholder="6204.43.00" />
        </label>
        <label className="space-y-1">
          <span>Referência do fornecedor (interna)</span>
          <input className={box} value={f.supplierRef} onChange={(e) => set("supplierRef", e.target.value)} />
        </label>
        <label className="space-y-1">
          <span>Referência TDP (exibida ao comprador)</span>
          <input className={box} value={f.tdpRef} onChange={(e) => set("tdpRef", e.target.value)} placeholder="TDP12345" />
        </label>
        <label className="space-y-1 md:col-span-3">
          <span>Descrição aduaneira (invoice / DHL, em inglês)</span>
          <input className={box} value={f.customsDescription} onChange={(e) => set("customsDescription", e.target.value)} placeholder="Women's dress, woven viscose" />
        </label>
      </div>

      <fieldset className="text-xs space-y-1">
        <legend className="mb-1">Visível nas operações</legend>
        <div className="flex flex-wrap gap-4">
          {OPS.map(([key, label]) => (
            <label key={key} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={f.visibleOps.includes(key)}
                onChange={(e) =>
                  setF((s) => ({ ...s, visibleOps: e.target.checked ? [...s.visibleOps, key] : s.visibleOps.filter((o) => o !== key) }))
                }
              />
              {label}
            </label>
          ))}
        </div>
        <p className="text-muted">A visibilidade por variante (tamanho × cor) fica na tabela de estoque abaixo.</p>
      </fieldset>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="bg-foreground text-background px-4 py-1.5 text-sm disabled:opacity-50">
          {pending ? "Salvando…" : "Salvar cadastro"}
        </button>
        {msg && <span className="text-xs">{msg}</span>}
      </div>
    </section>
  );
}
