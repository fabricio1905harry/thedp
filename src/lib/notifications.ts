import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendEmailNow } from "@/lib/email";
import { messagingProvider, sendMessage, type MessagingChannel } from "@/lib/messaging-adapter";
import { findTemplate, loadTemplateIndex, renderTemplateRow } from "@/lib/notification-templates";
import { samplePayload, type NotificationChannel, type NotificationLocale } from "@/lib/notification-events";

/**
 * Notifications engine, server side.
 * Events are queued by the database (queue_notification(), migration 0070)
 * or by app code through queueNotification(). E-mail rows are sent by
 * flushEmailOutbox(); WhatsApp/SMS rows by processMessagingQueue() (hourly
 * cron) through the adapter in messaging-adapter.ts (mock without provider).
 */

export async function queueNotification(
  event: string,
  customerId: string,
  orderId: string | null,
  payload: Record<string, unknown> = {},
  dedupe?: string
): Promise<{ error?: string }> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.rpc("queue_notification", {
    p_event: event,
    p_customer_id: customerId,
    p_order_id: orderId,
    p_payload: payload,
    p_dedupe: dedupe ?? null,
  });
  return error ? { error: error.message } : {};
}

export interface MessagingRunResult {
  processed: number;
  sent: number;
  mock: number;
  failed: number;
  held: number;
}

/** Renders and hands queued WhatsApp/SMS rows to the adapter. */
export async function processMessagingQueue(limit = 50): Promise<MessagingRunResult> {
  const out: MessagingRunResult = { processed: 0, sent: 0, mock: 0, failed: 0, held: 0 };
  const supabase = createServiceRoleClient();
  const index = await loadTemplateIndex(supabase);
  const { data: rows } = await supabase
    .from("notification_log")
    .select("id, event, channel, locale, to_address, payload, provider")
    .in("channel", ["whatsapp", "sms"])
    .eq("status", "queued")
    .eq("is_test", false)
    .order("created_at")
    .limit(limit);

  for (const row of rows ?? []) {
    const channel = row.channel as MessagingChannel;
    const real = messagingProvider(channel) !== "mock";
    // rows already recorded by the mock stay as they are until a real provider exists
    if (row.provider === "mock" && !real) continue;
    const locale = (["en", "es", "pt"].includes(row.locale) ? row.locale : "en") as NotificationLocale;
    let template = findTemplate(index, row.event, channel, locale, true);
    if (!template && !index.requireApproval) template = findTemplate(index, row.event, channel, locale, false);
    if (!template) {
      out.held++;
      await supabase.from("notification_log").update({ error: "Aguardando aprovação do template (Admin → Notificações)" }).eq("id", row.id);
      continue;
    }
    const rendered = renderTemplateRow(template, (row.payload ?? {}) as Record<string, unknown>, locale);
    out.processed++;
    const result = await sendMessage({ channel, to: row.to_address ?? "", body: rendered.body });
    await supabase
      .from("notification_log")
      .update({
        body: rendered.body,
        provider: result.provider,
        provider_ref: result.providerRef ?? null,
        status: result.status,
        error: result.error ?? null,
        sent_at: result.status === "sent" ? new Date().toISOString() : null,
      })
      .eq("id", row.id);
    if (result.status === "sent") out.sent++;
    else if (result.status === "failed") out.failed++;
    else out.mock++;
  }
  return out;
}

/** Test message from Admin → Notificações. Uses the template as saved (even a draft) and sample data. */
export async function sendTestNotification(input: {
  event: string;
  channel: NotificationChannel;
  locale: NotificationLocale;
  to: string;
}): Promise<{ error?: string; info?: string }> {
  const supabase = createServiceRoleClient();
  const index = await loadTemplateIndex(supabase);
  const template = findTemplate(index, input.event, input.channel, input.locale, false);
  if (!template) return { error: "Salve o texto deste evento/canal/idioma antes de enviar um teste." };
  const rendered = renderTemplateRow(template, samplePayload(), input.locale);

  if (input.channel === "email") {
    const sent = await sendEmailNow({
      to: input.to,
      subject: `[TESTE] ${rendered.subject}`,
      lines: rendered.lines,
      locale: input.locale,
    });
    await supabase.from("notification_log").insert({
      event: input.event,
      channel: "email",
      locale: input.locale,
      to_address: input.to,
      subject: `[TESTE] ${rendered.subject}`,
      body: rendered.body,
      status: sent.error ? "failed" : "sent",
      provider: "resend",
      error: sent.error ?? null,
      is_test: true,
      sent_at: sent.error ? null : new Date().toISOString(),
    });
    return sent.error ? { error: sent.error } : { info: `E-mail de teste enviado para ${input.to}.` };
  }

  const result = await sendMessage({ channel: input.channel, to: input.to, body: rendered.body });
  await supabase.from("notification_log").insert({
    event: input.event,
    channel: input.channel,
    locale: input.locale,
    to_address: input.to,
    body: rendered.body,
    status: result.status === "sent" ? "sent" : result.status === "failed" ? "failed" : "queued",
    provider: result.provider,
    provider_ref: result.providerRef ?? null,
    error: result.error ?? null,
    is_test: true,
    sent_at: result.status === "sent" ? new Date().toISOString() : null,
  });
  if (result.status === "failed") return { error: result.error };
  if (result.provider === "mock") return { info: "Modo MOCK: sem provedor de WhatsApp/SMS configurado — a mensagem foi apenas registrada no log, nada foi enviado." };
  return { info: `Mensagem de teste enviada para ${input.to}.` };
}
