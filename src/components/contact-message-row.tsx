"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setContactStatus } from "@/app/admin/contatos/actions";

export interface ContactRow {
  id: string;
  created_at: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  country: string | null;
  subject: string;
  message: string;
  locale: string | null;
  status: "new" | "in_progress" | "resolved";
  internal_note: string | null;
  customer_id: string | null;
}

const STATUS_LABEL = { new: "NEW", in_progress: "IN PROGRESS", resolved: "RESOLVED" } as const;
const STATUS_CLASS = {
  new: "bg-foreground text-background",
  in_progress: "bg-amber-100 text-amber-900",
  resolved: "bg-emerald-100 text-emerald-900",
} as const;

export function ContactMessageRow({ row }: { row: ContactRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(row.status === "new");
  const [note, setNote] = useState(row.internal_note ?? "");

  const run = (status: ContactRow["status"]) =>
    startTransition(async () => {
      await setContactStatus(row.id, status, note);
      router.refresh();
    });

  return (
    <div className="border border-border">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left p-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className={`px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[row.status]}`}>{STATUS_LABEL[row.status]}</span>
        <span className="text-xs text-muted whitespace-nowrap">{new Date(row.created_at).toLocaleString("pt-BR")}</span>
        <span className="text-sm font-medium">{row.subject}</span>
        <span className="text-xs text-muted">
          {row.name}
          {row.company ? ` · ${row.company}` : ""}
        </span>
      </button>
      {open && (
        <div className="border-t border-border p-4 space-y-3 text-sm">
          <p className="whitespace-pre-wrap">{row.message}</p>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted">
            <div>E-mail: <a href={`mailto:${row.email}`} className="underline text-foreground">{row.email}</a></div>
            {row.phone && <div>WhatsApp/Phone: <span className="text-foreground">{row.phone}</span></div>}
            {row.country && <div>Country: <span className="text-foreground">{row.country}</span></div>}
            {row.locale && <div>Language: <span className="text-foreground uppercase">{row.locale}</span></div>}
            {row.customer_id && <div>Buyer account: <span className="text-foreground">linked</span></div>}
          </dl>
          <label className="block text-xs">
            Internal note
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full border border-border px-2 py-1" />
          </label>
          <div className="flex flex-wrap gap-2 text-xs">
            {row.status !== "in_progress" && <button type="button" disabled={pending} onClick={() => run("in_progress")} className="border border-border px-3 py-1.5">Mark in progress</button>}
            {row.status !== "resolved" && <button type="button" disabled={pending} onClick={() => run("resolved")} className="btn-primary px-3 py-1.5">Mark resolved</button>}
            {row.status !== "new" && <button type="button" disabled={pending} onClick={() => run("new")} className="border border-border px-3 py-1.5">Reopen</button>}
            {note !== (row.internal_note ?? "") && <button type="button" disabled={pending} onClick={() => run(row.status)} className="underline">Save note</button>}
          </div>
        </div>
      )}
    </div>
  );
}
