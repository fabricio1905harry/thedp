"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { replyToContact, setContactStatus } from "@/app/admin/contatos/actions";

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
  order_id: string | null;
  order_number: string | null;
  replied_at: string | null;
  reply_text: string | null;
}

const SUBJECT_LABEL: Record<string, string> = { return: "Devolução / pós-venda" };

const STATUS_LABEL = { new: "NOVO", in_progress: "EM ANDAMENTO", resolved: "RESOLVIDO" } as const;
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
  const [reply, setReply] = useState("");
  const [replyMsg, setReplyMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const sendReply = () =>
    startTransition(async () => {
      setReplyMsg(null);
      const res = await replyToContact(row.id, reply);
      if (res.error) {
        setReplyMsg({ ok: false, text: res.error });
        return;
      }
      setReply("");
      setReplyMsg({ ok: !res.emailNote, text: res.emailNote ?? "Resposta enviada por e-mail." });
      router.refresh();
    });

  const run = (status: ContactRow["status"]) =>
    startTransition(async () => {
      await setContactStatus(row.id, status, note);
      router.refresh();
    });

  return (
    <div className="border border-border">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left p-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className={`px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[row.status]}`}>{STATUS_LABEL[row.status]}</span>
        <span className="text-xs text-muted whitespace-nowrap">{new Date(row.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
        <span className="text-sm font-medium">{SUBJECT_LABEL[row.subject] ?? row.subject}</span>
        {row.order_number && <span className="text-xs text-muted">Pedido {row.order_number}</span>}
        {row.replied_at && <span className="text-[10px] text-emerald-800">respondido</span>}
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
            {row.phone && <div>WhatsApp/Telefone: <span className="text-foreground">{row.phone}</span></div>}
            {row.country && <div>País: <span className="text-foreground">{row.country}</span></div>}
            {row.locale && <div>Idioma: <span className="text-foreground uppercase">{row.locale}</span></div>}
            {row.order_id && (
              <div>
                Pedido:{" "}
                <Link href={`/admin/pedidos/${row.order_id}`} className="underline text-foreground">
                  {row.order_number ?? row.order_id.slice(0, 8)}
                </Link>
              </div>
            )}
            {row.customer_id && <div>Conta de comprador: <span className="text-foreground">vinculada</span></div>}
          </dl>
          {row.reply_text && (
            <div className="text-xs border-l-2 border-border pl-3">
              <p className="text-muted">Última resposta ({row.replied_at ? new Date(row.replied_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : ""}):</p>
              <p className="whitespace-pre-wrap">{row.reply_text}</p>
            </div>
          )}
          <div className="space-y-2">
            <label className="block text-xs">
              Responder ao cliente (enviado por e-mail para {row.email})
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} className="mt-1 w-full border border-border rounded-lg px-2 py-1" />
            </label>
            <button type="button" disabled={pending || reply.trim().length < 2} onClick={sendReply} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50">
              {pending ? "Enviando…" : "Enviar resposta"}
            </button>
            {replyMsg && <p className={`text-xs ${replyMsg.ok ? "text-emerald-800" : "text-red-700"}`}>{replyMsg.text}</p>}
          </div>
          <label className="block text-xs">
            Nota interna
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full border border-border px-2 py-1" />
          </label>
          <div className="flex flex-wrap gap-2 text-xs">
            {row.status !== "in_progress" && <button type="button" disabled={pending} onClick={() => run("in_progress")} className="border border-border px-3 py-1.5">Marcar em andamento</button>}
            {row.status !== "resolved" && <button type="button" disabled={pending} onClick={() => run("resolved")} className="btn-primary px-3 py-1.5">Marcar como resolvido</button>}
            {row.status !== "new" && <button type="button" disabled={pending} onClick={() => run("new")} className="border border-border px-3 py-1.5">Reabrir</button>}
            {note !== (row.internal_note ?? "") && <button type="button" disabled={pending} onClick={() => run(row.status)} className="underline">Salvar nota</button>}
          </div>
        </div>
      )}
    </div>
  );
}
