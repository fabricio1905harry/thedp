"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveNotificationTemplate,
  sendNotificationTest,
  type ActionResult,
} from "@/app/admin/notificacoes/actions";
import {
  CHANNEL_LABELS_PT,
  PLACEHOLDER_HELP,
  buildTemplateVars,
  fillPlaceholders,
  samplePayload,
  unknownPlaceholders,
  type NotificationChannel,
  type NotificationLocale,
} from "@/lib/notification-events";

const LOCALE_LABELS: Record<NotificationLocale, string> = { en: "EN (master)", es: "ES", pt: "PT" };

export function NotificationTemplateEditor({
  event,
  channel,
  locale,
  placeholders,
  initial,
  defaultTo,
}: {
  event: string;
  channel: NotificationChannel;
  locale: NotificationLocale;
  placeholders: string[];
  initial: { subject: string; body: string; approved: boolean; exists: boolean };
  defaultTo: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [approved, setApproved] = useState(initial.approved);
  const [to, setTo] = useState(defaultTo);
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const dirty = subject !== initial.subject || body !== initial.body || approved !== initial.approved;
  const bad = unknownPlaceholders(`${subject}\n${body}`, placeholders);
  const vars = buildTemplateVars(samplePayload(), locale);

  function run(fn: () => Promise<ActionResult>) {
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setMessage({ kind: "error", text: result.error });
      else {
        setMessage({ kind: "ok", text: result.info ?? "OK" });
        router.refresh();
      }
    });
  }

  return (
    <div className="border border-border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {CHANNEL_LABELS_PT[channel]} · {LOCALE_LABELS[locale]}
        </h3>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 border ${
            initial.approved ? "border-foreground bg-foreground text-background" : "border-border text-muted"
          }`}
        >
          {!initial.exists ? "NÃO CRIADO" : initial.approved ? "APROVADO" : "RASCUNHO"}
        </span>
      </div>

      {channel === "email" && (
        <label className="block text-xs space-y-1">
          <span className="text-muted">Assunto</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full border border-border px-2 py-1.5 text-sm" />
        </label>
      )}
      <label className="block text-xs space-y-1">
        <span className="text-muted">Texto (parágrafos separados por linha em branco)</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={channel === "email" ? 8 : 4} className="w-full border border-border px-2 py-1.5 text-sm font-mono" />
      </label>

      <p className="text-[11px] text-muted">
        Variáveis:{" "}
        {placeholders.map((p) => (
          <code key={p} title={PLACEHOLDER_HELP[p]} className="mr-1.5 bg-surface px-1">
            {`{${p}}`}
          </code>
        ))}
      </p>
      {bad.length > 0 && <p className="text-xs text-red-700">Variáveis inválidas neste evento: {bad.map((b) => `{${b}}`).join(", ")}</p>}

      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
        <span>Texto aprovado pelo cliente (somente textos aprovados são enviados)</span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || bad.length > 0 || (!dirty && initial.exists)}
          onClick={() => run(() => saveNotificationTemplate({ event, channel, locale, subject, body, approved }))}
          className="bg-foreground text-background text-xs px-3 py-1.5 disabled:opacity-40"
        >
          Salvar
        </button>
        <button type="button" onClick={() => setPreview((v) => !v)} className="border border-border text-xs px-3 py-1.5">
          {preview ? "Ocultar prévia" : "Prévia"}
        </button>
      </div>

      {preview && (
        <div className="bg-surface border border-border p-3 text-sm space-y-2">
          {channel === "email" && <p className="font-semibold">{fillPlaceholders(subject, vars)}</p>}
          {fillPlaceholders(body, vars)
            .split(/\n{2,}/)
            .map((para, i) => (
              <p key={i} className="whitespace-pre-line">
                {para}
              </p>
            ))}
          <p className="text-[11px] text-muted">Prévia com dados de exemplo.</p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <label className="text-xs space-y-1">
          <span className="text-muted">{channel === "email" ? "Enviar teste para (e-mail)" : "Enviar teste para (telefone com +DDI)"}</span>
          <input value={to} onChange={(e) => setTo(e.target.value)} className="block border border-border px-2 py-1.5 text-sm w-64" />
        </label>
        <button
          type="button"
          disabled={pending || !initial.exists || dirty}
          title={dirty ? "Salve antes de testar" : undefined}
          onClick={() => run(() => sendNotificationTest({ event, channel, locale, to }))}
          className="border border-foreground text-xs px-3 py-1.5 disabled:opacity-40"
        >
          Enviar teste
        </button>
      </div>

      {message && <p className={`text-xs ${message.kind === "error" ? "text-red-700" : "text-foreground"}`}>{message.text}</p>}
    </div>
  );
}
