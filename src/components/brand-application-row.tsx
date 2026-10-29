"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBrandApplication, type BrandStatus } from "@/app/admin/candidaturas-marcas/actions";

export interface BrandApplicationRow {
  id: string;
  created_at: string;
  brand_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  country: string | null;
  message: string | null;
  status: BrandStatus;
  notes: string | null;
}

export const BRAND_STATUS_LABELS: Record<BrandStatus, string> = {
  new: "NOVA",
  under_review: "EM ANÁLISE",
  contacted: "CONTATADA",
  approved: "APROVADA",
  not_a_fit: "SEM ENCAIXE",
  on_hold: "EM ESPERA",
};

export function BrandApplicationRowView({ row }: { row: BrandApplicationRow }) {
  const router = useRouter();
  const [status, setStatus] = useState<BrandStatus>(row.status);
  const [notes, setNotes] = useState(row.notes ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMsg(null);
    start(async () => {
      const res = await updateBrandApplication(row.id, status, notes);
      setMsg(res.error ?? "Salvo.");
      router.refresh();
    });
  }

  return (
    <details className="border border-border">
      <summary className="flex flex-wrap items-center gap-3 px-3 py-2 cursor-pointer text-sm">
        <strong>{row.brand_name}</strong>
        <span className="text-muted">{row.contact_name}</span>
        <span className="text-xs text-muted">{row.country ?? ""}</span>
        <span className="ml-auto text-[11px] font-semibold tracking-wider">{BRAND_STATUS_LABELS[row.status]}</span>
        <span className="text-xs text-muted whitespace-nowrap">{new Date(row.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
      </summary>
      <div className="border-t border-border p-3 space-y-3 text-sm">
        <p className="text-xs">
          <a href={`mailto:${row.email}`} className="underline">{row.email}</a>
          {row.phone && <> · {row.phone}</>}
          {row.website && <> · <a href={/^https?:/.test(row.website) ? row.website : `https://${row.website}`} className="underline" target="_blank" rel="noopener noreferrer">{row.website}</a></>}
          {row.instagram && <> · {row.instagram}</>}
        </p>
        {row.message && <p className="whitespace-pre-line">{row.message}</p>}
        <div className="flex flex-wrap items-start gap-3 text-xs">
          <label className="space-y-1">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as BrandStatus)} className="block border border-border px-2 py-1.5">
              {(Object.keys(BRAND_STATUS_LABELS) as BrandStatus[]).map((s) => (
                <option key={s} value={s}>{BRAND_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 flex-1 min-w-[16rem]">
            <span>Notas internas</span>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="block w-full border border-border px-2 py-1.5" />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" disabled={pending} onClick={save} className="bg-foreground text-background px-4 py-1.5 text-xs disabled:opacity-50">
            {pending ? "Salvando…" : "Salvar"}
          </button>
          {msg && <span className="text-xs">{msg}</span>}
        </div>
      </div>
    </details>
  );
}
