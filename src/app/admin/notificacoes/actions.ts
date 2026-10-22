"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";
import { sendTestNotification } from "@/lib/notifications";
import {
  EVENT_BY_CODE,
  NOTIFICATION_EVENTS,
  NOTIFICATION_LOCALES,
  defaultDraft,
  unknownPlaceholders,
  type NotificationChannel,
  type NotificationLocale,
} from "@/lib/notification-events";

export type ActionResult = { error?: string; info?: string };

async function safe(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (err) {
    console.error("[admin/notificacoes]", err);
    return { error: err instanceof Error ? err.message : "Falha na ação." };
  }
}

async function requireStaff() {
  const staff = await getCurrentStaff();
  if (!staff) throw new Error("Não autorizado");
  return staff;
}

export interface SaveTemplateInput {
  event: string;
  channel: NotificationChannel;
  locale: NotificationLocale;
  subject: string;
  body: string;
  approved: boolean;
}

export async function saveNotificationTemplate(input: SaveTemplateInput): Promise<ActionResult> {
  return safe(async () => {
    const staff = await requireStaff();
    const def = EVENT_BY_CODE[input.event];
    if (!def) return { error: "Evento desconhecido." };
    if (input.approved && !input.body.trim()) return { error: "Não é possível aprovar um texto vazio." };
    if (input.channel === "email" && input.approved && !input.subject.trim()) return { error: "O e-mail precisa de assunto para ser aprovado." };
    const bad = unknownPlaceholders(`${input.subject}\n${input.body}`, def.placeholders);
    if (bad.length > 0) return { error: `Variáveis inválidas para este evento: ${bad.map((b) => `{${b}}`).join(", ")}` };

    const supabase = await createClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("notification_templates")
      .upsert(
        {
          event: input.event,
          channel: input.channel,
          locale: input.locale,
          subject: input.channel === "email" ? input.subject.trim() : "",
          body: input.body.trim(),
          approved: input.approved,
          approved_at: input.approved ? now : null,
          approved_by: input.approved ? staff.id : null,
          updated_at: now,
          updated_by: staff.id,
        },
        { onConflict: "event,channel,locale" }
      )
      .select("id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "Nada foi salvo (sem permissão?)." };
    revalidatePath("/admin/notificacoes");
    return { info: input.approved ? "Texto salvo e aprovado." : "Texto salvo como rascunho (não será enviado)." };
  });
}

/** Inserts the missing default drafts (approved = false). Existing rows are untouched. */
export async function createDefaultDrafts(): Promise<ActionResult> {
  return safe(async () => {
    const staff = await requireStaff();
    const supabase = await createClient();
    const { data: existing, error: readError } = await supabase.from("notification_templates").select("event, channel, locale");
    if (readError) return { error: readError.message };
    const have = new Set((existing ?? []).map((r) => `${r.event}|${r.channel}|${r.locale}`));
    const rows: Record<string, unknown>[] = [];
    for (const def of NOTIFICATION_EVENTS) {
      for (const channel of def.channels) {
        for (const locale of NOTIFICATION_LOCALES) {
          if (have.has(`${def.code}|${channel}|${locale}`)) continue;
          const draft = defaultDraft(def.code, channel, locale);
          if (!draft) continue;
          rows.push({ event: def.code, channel, locale, subject: draft.subject, body: draft.body, approved: false, updated_by: staff.id });
        }
      }
    }
    if (rows.length === 0) return { info: "Todos os rascunhos padrão já existem." };
    const { data, error } = await supabase.from("notification_templates").insert(rows).select("id");
    if (error) return { error: error.message };
    revalidatePath("/admin/notificacoes");
    return { info: `${data?.length ?? 0} rascunho(s) criado(s). Revise e aprove cada texto.` };
  });
}

export async function sendNotificationTest(input: {
  event: string;
  channel: NotificationChannel;
  locale: NotificationLocale;
  to: string;
}): Promise<ActionResult> {
  return safe(async () => {
    await requireStaff();
    const to = input.to.trim();
    if (!to) return { error: "Informe o destinatário do teste." };
    if (input.channel === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { error: "E-mail inválido." };
    const result = await sendTestNotification({ ...input, to });
    revalidatePath("/admin/notificacoes");
    return result;
  });
}

const SETTING_KEYS = new Set(["notifications_require_approval", "payment_window_reminder_hours"]);

export async function setNotificationSetting(key: string, value: boolean | number): Promise<ActionResult> {
  return safe(async () => {
    const staff = await requireStaff();
    if (!SETTING_KEYS.has(key)) return { error: "Configuração inválida." };
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0 || value > 168)) return { error: "Valor inválido (0 a 168)." };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: staff.id }, { onConflict: "key" })
      .select("key");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "Nada foi salvo (sem permissão?)." };
    revalidatePath("/admin/notificacoes");
    return { info: "Configuração salva." };
  });
}
