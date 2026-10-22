"use client";

import { useState } from "react";
import { deleteSizeRow, saveSizeRow, type SizeRowInput } from "@/app/admin/tamanhos/actions";
import { Msg, btnCls, btnGhost, inputCls, useRun } from "@/components/admin-ui";

interface DbRow {
  id: string;
  size_br: string;
  size_us: string | null;
  size_eu: string | null;
  letter: string | null;
  aliases: string[] | null;
  bust_cm: string | null;
  waist_cm: string | null;
  hip_cm: string | null;
  note_en: string | null;
  note_es: string | null;
  note_pt: string | null;
  sort: number;
  active: boolean;
}

const toInput = (r?: DbRow): SizeRowInput => ({
  id: r?.id,
  size_br: r?.size_br ?? "",
  size_us: r?.size_us ?? "",
  size_eu: r?.size_eu ?? "",
  letter: r?.letter ?? "",
  aliases: (r?.aliases ?? []).join(", "),
  bust_cm: r?.bust_cm ?? "",
  waist_cm: r?.waist_cm ?? "",
  hip_cm: r?.hip_cm ?? "",
  note_en: r?.note_en ?? "",
  note_es: r?.note_es ?? "",
  note_pt: r?.note_pt ?? "",
  sort: r?.sort ?? 100,
  active: r?.active ?? true,
});

export function SizeChartAdmin({ rows }: { rows: DbRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Row key={r.id + r.size_br} initial={toInput(r)} />
      ))}
      <h2 className="text-sm font-semibold pt-2">Adicionar tamanho</h2>
      <Row initial={toInput()} isNew />
    </div>
  );
}

function Row({ initial, isNew }: { initial: SizeRowInput; isNew?: boolean }) {
  const { pending, message, run } = useRun();
  const [r, setR] = useState(initial);
  const set = <K extends keyof SizeRowInput>(k: K, v: SizeRowInput[K]) => setR((p) => ({ ...p, [k]: v }));
  const small = (k: keyof SizeRowInput, ph: string) => (
    <input value={String(r[k] ?? "")} placeholder={ph} onChange={(e) => set(k, e.target.value as never)} className={inputCls} />
  );
  return (
    <div className="border border-border p-3 space-y-2">
      <div className="grid grid-cols-3 md:grid-cols-8 gap-2">
        {small("size_br", "BR")}
        {small("size_us", "US")}
        {small("size_eu", "EU")}
        {small("letter", "Letra (M)")}
        <div className="col-span-2">{small("aliases", "Apelidos (P, G…)")}</div>
        <input type="number" value={r.sort} onChange={(e) => set("sort", Number(e.target.value))} className={inputCls} title="Ordem" />
        <label className="text-xs flex items-center gap-1">
          <input type="checkbox" checked={r.active} onChange={(e) => set("active", e.target.checked)} /> ativo
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {small("bust_cm", "Busto (cm)")}
        {small("waist_cm", "Cintura (cm)")}
        {small("hip_cm", "Quadril (cm)")}
      </div>
      <div className="grid md:grid-cols-3 gap-2">
        {small("note_en", "Nota EN")}
        {small("note_es", "Nota ES")}
        {small("note_pt", "Nota PT")}
      </div>
      <div className="flex items-center gap-3">
        <button
          disabled={pending}
          className={btnCls}
          onClick={() => run(() => saveSizeRow(r), "Salvo.", () => isNew && setR(toInput()))}
        >
          {isNew ? "Adicionar" : "Salvar"}
        </button>
        {!isNew && r.id && (
          <button
            disabled={pending}
            className={btnGhost}
            onClick={() => {
              if (confirm("Remover esta linha da tabela de tamanhos?")) run(() => deleteSizeRow(r.id!), "Removido.");
            }}
          >
            Remover
          </button>
        )}
        <Msg message={message} />
      </div>
    </div>
  );
}
