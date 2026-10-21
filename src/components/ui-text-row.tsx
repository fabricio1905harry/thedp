"use client";

import { useState, useTransition } from "react";
import { saveUiText, resetUiText } from "@/app/admin/textos/actions";

export interface UiTextRowData {
  key: string;
  base: { en: string; es: string; pt: string };
  override: { en?: string; es?: string; pt?: string };
}

export function UiTextRow({ row }: { row: UiTextRowData }) {
  const [vals, setVals] = useState({ en: row.override.en ?? "", es: row.override.es ?? "", pt: row.override.pt ?? "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const customised = Object.values(row.override).some(Boolean);

  function save() {
    start(async () => {
      const res = await saveUiText(row.key, vals);
      setMsg(res.error ?? "Salvo");
    });
  }
  function reset() {
    start(async () => {
      const res = await resetUiText(row.key);
      if (!res.error) setVals({ en: "", es: "", pt: "" });
      setMsg(res.error ?? "Voltou ao padrão");
    });
  }

  return (
    <div className={`border p-3 space-y-2 ${customised ? "border-foreground" : "border-border"}`}>
      <p className="font-mono text-[11px] text-muted">{row.key}{customised && <span className="ml-2 font-semibold text-foreground">EDITADO</span>}</p>
      <div className="grid md:grid-cols-3 gap-2">
        {(["en", "es", "pt"] as const).map((l) => (
          <label key={l} className="block text-[11px]">
            <span className="font-semibold uppercase tracking-wider">{l}</span>
            <textarea
              rows={2}
              value={vals[l]}
              placeholder={row.base[l]}
              onChange={(e) => setVals({ ...vals, [l]: e.target.value })}
              className="mt-1 w-full border border-border p-2 text-sm"
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs">
        <button onClick={save} disabled={pending} className="bg-foreground text-background px-3 py-1.5 disabled:opacity-50">Salvar</button>
        {customised && <button onClick={reset} disabled={pending} className="border border-border px-3 py-1.5">Restaurar padrão</button>}
        {msg && <span className="text-muted">{msg}</span>}
      </div>
    </div>
  );
}
