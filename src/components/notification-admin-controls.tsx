"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDefaultDrafts, setNotificationSetting, type ActionResult } from "@/app/admin/notificacoes/actions";

export function NotificationAdminControls({
  requireApproval,
  reminderHours,
  emailConfigured,
  whatsappProvider,
  smsProvider,
}: {
  requireApproval: boolean;
  reminderHours: number;
  emailConfigured: boolean;
  whatsappProvider: string;
  smsProvider: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hours, setHours] = useState(String(reminderHours));
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

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
    <section className="border border-border p-4 space-y-3 text-sm">
      <div className="grid sm:grid-cols-3 gap-2 text-xs">
        <p className="border border-border p-2">
          <strong>E-mail:</strong> {emailConfigured ? "Resend configurado" : "sem RESEND_API_KEY / EMAIL_FROM — mensagens ficam na fila"}
        </p>
        <p className="border border-border p-2">
          <strong>WhatsApp:</strong> {whatsappProvider === "mock" ? "MOCK (apenas registra)" : whatsappProvider}
        </p>
        <p className="border border-border p-2">
          <strong>SMS:</strong> {smsProvider === "mock" ? "MOCK (apenas registra)" : smsProvider}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            defaultChecked={requireApproval}
            disabled={pending}
            onChange={(e) => run(() => setNotificationSetting("notifications_require_approval", e.target.checked))}
          />
          Enviar somente textos aprovados (recomendado)
        </label>
        <label className="flex items-center gap-2 text-xs">
          Lembrete de janela de pagamento (horas antes):
          <input value={hours} onChange={(e) => setHours(e.target.value)} className="w-16 border border-border px-2 py-1 text-sm" inputMode="numeric" />
          <button type="button" disabled={pending} onClick={() => run(() => setNotificationSetting("payment_window_reminder_hours", Number(hours)))} className="border border-border px-2 py-1">
            Salvar
          </button>
        </label>
        <button type="button" disabled={pending} onClick={() => run(() => createDefaultDrafts())} className="bg-foreground text-background text-xs px-3 py-1.5 disabled:opacity-40">
          Criar rascunhos padrão
        </button>
      </div>
      {message && <p className={`text-xs ${message.kind === "error" ? "text-red-700" : ""}`}>{message.text}</p>}
    </section>
  );
}
