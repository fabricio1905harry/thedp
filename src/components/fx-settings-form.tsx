"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveFxSettings } from "@/app/admin/cambio/actions";
import type { FxAutoSettings } from "@/lib/fx-auto";

export function FxSettingsForm({ settings }: { settings: FxAutoSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ enabled: settings.enabled, source: settings.source, frequency: settings.frequency });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const last = settings.last_run;

  return (
    <section className="border border-border p-4 mb-6 max-w-2xl">
      <h2 className="text-sm font-medium uppercase tracking-wide mb-3">Atualização automática</h2>
      <form
        className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          startTransition(async () => {
            const res = await saveFxSettings(form);
            if (res.error) return setMessage({ ok: false, text: res.error });
            setMessage({ ok: true, text: "Configuração salva." });
            router.refresh();
          });
        }}
      >
        <label className="flex flex-col">
          Fonte da cotação
          <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as "ecb" | "ptax" })} className="border border-border px-2 py-1">
            <option value="ecb">BCE (Banco Central Europeu, via Frankfurter)</option>
            <option value="ptax">Banco Central do Brasil — PTAX (venda)</option>
          </select>
        </label>
        <label className="flex flex-col">
          Frequência
          <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as "daily" | "weekly" })} className="border border-border px-2 py-1">
            <option value="daily">Diária</option>
            <option value="weekly">Semanal</option>
          </select>
        </label>
        <label className="flex items-end gap-2">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          Atualização automática ligada
        </label>
        <div className="sm:col-span-3 flex items-center gap-3">
          <button type="submit" disabled={pending} className="btn-primary px-3 py-1.5">
            {pending ? "Salvando…" : "Salvar"}
          </button>
          {message && <span className={message.ok ? "" : "text-red-600"}>{message.text}</span>}
        </div>
      </form>
      <p className="text-[11px] text-muted mt-3">
        {last ? (
          <>
            Última execução: {new Date(last.at).toLocaleString("pt-BR")} ·{" "}
            <strong className={last.ok ? "text-emerald-700" : "text-red-700"}>{last.ok ? "sucesso" : "falhou"}</strong> ·{" "}
            {last.source === "ptax" ? "PTAX" : "BCE"} ({last.trigger === "cron" ? "agendada" : "manual"}) — {last.message}
          </>
        ) : (
          "Nenhuma execução registrada ainda."
        )}
      </p>
      <p className="text-[11px] text-muted mt-1">
        Se a fonte estiver fora do ar, a última cotação salva é mantida e um alerta “Falha na atualização do câmbio” é criado no Action Center.
      </p>
    </section>
  );
}
