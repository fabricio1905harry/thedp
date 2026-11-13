"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSupplier, saveSupplier, type SupplierInput } from "@/app/admin/automacao/actions";

export interface SupplierRow {
  id: string;
  supplier_name: string;
  supplier_url?: string | null;
  status: "active" | "pending" | "not_built";
  included_in_contract: boolean;
}

const STATUS_LABEL: Record<SupplierRow["status"], string> = {
  active: "Ativo",
  pending: "Em construção",
  not_built: "Não construído",
};
const input = "w-full border border-border px-2 py-1.5 text-sm";

const toInput = (r: SupplierRow | null): SupplierInput => ({
  id: r?.id ?? "",
  name: r?.supplier_name ?? "",
  url: r?.supplier_url ?? "",
  status: r?.status ?? "not_built",
  includedInContract: r?.included_in_contract ?? true,
});

/** Admin → Automação: register suppliers (name + URL) and edit the existing ones. */
export function SuppliersAdmin({ rows, urlAvailable }: { rows: SupplierRow[]; urlAvailable: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="space-y-4 mb-10">
      {!urlAvailable && (
        <p className="text-xs text-red-700">Rode a migration 0091 no Supabase para cadastrar a URL dos fornecedores.</p>
      )}
      <div className="border border-border p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide mb-3">Cadastrar fornecedor</h2>
        <SupplierForm key={`new-${rows.length}`} initial={null} onDone={() => undefined} />
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted uppercase border-b border-border">
            <th className="py-2 pr-4">Fornecedor</th>
            <th className="py-2 pr-4">URL</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Incluído no contrato</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) =>
            editing === r.id ? (
              <tr key={r.id} className="border-b border-border">
                <td colSpan={5} className="py-3">
                  <SupplierForm initial={r} onDone={() => setEditing(null)} />
                </td>
              </tr>
            ) : (
              <tr key={r.id} className="border-b border-border">
                <td className="py-2 pr-4 font-medium">{r.supplier_name}</td>
                <td className="py-2 pr-4 max-w-xs truncate">
                  {r.supplier_url ? (
                    <a href={r.supplier_url} target="_blank" rel="noopener noreferrer" className="underline">
                      {r.supplier_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </a>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="py-2 pr-4">{STATUS_LABEL[r.status] ?? r.status}</td>
                <td className="py-2 pr-4">{r.included_in_contract ? "Sim" : "Não"}</td>
                <td className="py-2 text-right">
                  <button type="button" onClick={() => setEditing(r.id)} className="text-xs underline">
                    Editar
                  </button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

function SupplierForm({ initial, onDone }: { initial: SupplierRow | null; onDone: () => void }) {
  const router = useRouter();
  const [f, setF] = useState<SupplierInput>(toInput(initial));
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveSupplier(f);
      if (res.error) return setMsg({ error: true, text: res.error });
      setMsg({ error: false, text: initial ? "Fornecedor salvo." : "Fornecedor cadastrado." });
      if (!initial) setF(toInput(null));
      router.refresh();
      if (initial) onDone();
    });
  }
  function remove() {
    if (!initial || !window.confirm(`Excluir o fornecedor “${initial.supplier_name}”?`)) return;
    start(async () => {
      const res = await deleteSupplier(initial.id);
      if (res.error) return setMsg({ error: true, text: res.error });
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-[1fr_1.4fr_auto_auto] gap-3 items-end text-xs">
        <label className="space-y-1">
          <span className="text-muted">Nome do fornecedor</span>
          <input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Vesti" />
        </label>
        <label className="space-y-1">
          <span className="text-muted">URL do fornecedor</span>
          <input className={input} value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://www.fornecedor.com.br" inputMode="url" />
        </label>
        <label className="space-y-1">
          <span className="text-muted">Status</span>
          <select className={`${input} bg-background`} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as SupplierInput["status"] })}>
            {(Object.keys(STATUS_LABEL) as SupplierRow["status"][]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2">
          <input type="checkbox" checked={f.includedInContract} onChange={(e) => setF({ ...f, includedInContract: e.target.checked })} />
          No contrato
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} onClick={save} className="bg-foreground text-background text-xs px-4 py-2 disabled:opacity-40">
          {pending ? "Salvando…" : initial ? "Salvar" : "Cadastrar fornecedor"}
        </button>
        {initial && (
          <>
            <button type="button" disabled={pending} onClick={onDone} className="text-xs underline">Cancelar</button>
            <button type="button" disabled={pending} onClick={remove} className="text-xs text-red-700 underline ml-auto">Excluir</button>
          </>
        )}
        {msg && <span className={`text-xs ${msg.error ? "text-red-700" : ""}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
