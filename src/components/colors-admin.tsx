"use client";

import { useState } from "react";
import { saveColorMapping, saveTdpColor } from "@/app/admin/cores/actions";
import { Msg, btnCls, btnGhost, inputCls, useRun } from "@/components/admin-ui";

interface Color {
  id: string;
  name_en: string;
  name_es: string;
  name_pt: string;
  hex: string | null;
  active: boolean;
}
interface Row {
  supplier_key: string;
  supplier_color: string;
  tdp_color_id: string | null;
  status: string;
  manual_override: boolean;
  uses: number;
}

const STATUS: Record<string, string> = { auto: "Automático", needs_review: "Revisar", approved: "Aprovado" };

export function ColorsAdmin({ colors, rows }: { colors: Color[]; rows: Row[] }) {
  return (
    <>
      <section className="border border-border p-4">
        <h2 className="text-sm font-semibold mb-3">Cores do fornecedor → cor TDP</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="py-2 pr-3">Cor do fornecedor</th>
                <th className="py-2 pr-3">Variantes</th>
                <th className="py-2 pr-3">Cor TDP</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <MapRow key={r.supplier_key} row={r} colors={colors} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border border-border p-4">
        <h2 className="text-sm font-semibold mb-1">Cores TDP (nomes aprovados EN / ES / PT)</h2>
        <p className="text-xs text-muted mb-3">Os nomes valem para filtro, página do produto, carrinho e pedido.</p>
        <div className="space-y-2">
          {colors.map((c) => (
            <ColorRow key={c.id} color={c} />
          ))}
          <ColorRow color={{ id: "", name_en: "", name_es: "", name_pt: "", hex: "", active: true }} isNew />
        </div>
      </section>
    </>
  );
}

function MapRow({ row, colors }: { row: Row; colors: Color[] }) {
  const { pending, message, run } = useRun();
  const [value, setValue] = useState(row.tdp_color_id ?? "");
  return (
    <tr className="border-t border-border align-top">
      <td className="py-2 pr-3 font-medium">{row.supplier_color}</td>
      <td className="py-2 pr-3 text-muted">{row.uses}</td>
      <td className="py-2 pr-3">
        <select value={value} onChange={(e) => setValue(e.target.value)} className={inputCls}>
          <option value="">— sem correspondência (fora do filtro) —</option>
          {colors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name_pt} / {c.name_en}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-3">
        <span className={`text-xs px-2 py-0.5 rounded-sm ${row.status === "needs_review" ? "bg-amber-100 text-amber-900" : "bg-surface"}`}>
          {STATUS[row.status] ?? row.status}
          {row.manual_override ? " · manual" : ""}
        </span>
      </td>
      <td className="py-2 whitespace-nowrap space-x-2">
        <button disabled={pending || !value} onClick={() => run(() => saveColorMapping(row.supplier_key, value, true), "Aprovado.")} className={btnCls}>
          Aprovar
        </button>
        <button disabled={pending} onClick={() => run(() => saveColorMapping(row.supplier_key, value, false), "Salvo para revisão.")} className={btnGhost}>
          Salvar
        </button>
        <Msg message={message} />
      </td>
    </tr>
  );
}

function ColorRow({ color, isNew }: { color: Color; isNew?: boolean }) {
  const { pending, message, run } = useRun();
  const [c, setC] = useState({ ...color, hex: color.hex ?? "" });
  return (
    <div className="grid grid-cols-2 md:grid-cols-[9rem_1fr_1fr_1fr_6rem_auto] gap-2 items-center">
      <input value={c.id} disabled={!isNew} placeholder="CÓDIGO" onChange={(e) => setC({ ...c, id: e.target.value })} className={inputCls} />
      <input value={c.name_en} placeholder="EN" onChange={(e) => setC({ ...c, name_en: e.target.value })} className={inputCls} />
      <input value={c.name_es} placeholder="ES" onChange={(e) => setC({ ...c, name_es: e.target.value })} className={inputCls} />
      <input value={c.name_pt} placeholder="PT" onChange={(e) => setC({ ...c, name_pt: e.target.value })} className={inputCls} />
      <input value={c.hex} placeholder="#RRGGBB" onChange={(e) => setC({ ...c, hex: e.target.value })} className={inputCls} />
      <div className="flex items-center gap-2">
        <label className="text-xs flex items-center gap-1">
          <input type="checkbox" checked={c.active} onChange={(e) => setC({ ...c, active: e.target.checked })} /> ativa
        </label>
        <button
          disabled={pending}
          onClick={() =>
            run(
              () => saveTdpColor({ ...c, isNew: Boolean(isNew) }),
              "Salvo.",
              () => isNew && setC({ id: "", name_en: "", name_es: "", name_pt: "", hex: "", active: true })
            )
          }
          className={btnCls}
        >
          {isNew ? "Adicionar" : "Salvar"}
        </button>
      </div>
      <div className="col-span-full">
        <Msg message={message} />
      </div>
    </div>
  );
}
