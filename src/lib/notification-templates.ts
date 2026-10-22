import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildTemplateVars,
  fillPlaceholders,
  type NotificationChannel,
  type NotificationLocale,
} from "@/lib/notification-events";

/**
 * Reads notification_templates (Admin → Notificações) for the e-mail sender
 * and the messaging queue. Only APPROVED texts are sent unless the setting
 * notifications_require_approval is turned off.
 */

export interface TemplateRow {
  event: string;
  channel: NotificationChannel;
  locale: NotificationLocale;
  subject: string;
  body: string;
  approved: boolean;
}

export interface TemplateIndex {
  rows: Map<string, TemplateRow>;
  requireApproval: boolean;
}

const key = (event: string, channel: string, locale: string) => `${event}|${channel}|${locale}`;

export async function loadTemplateIndex(supabase: SupabaseClient): Promise<TemplateIndex> {
  const [{ data: rows }, { data: setting }] = await Promise.all([
    supabase.from("notification_templates").select("event, channel, locale, subject, body, approved"),
    supabase.from("app_settings").select("value").eq("key", "notifications_require_approval").maybeSingle(),
  ]);
  const map = new Map<string, TemplateRow>();
  for (const r of (rows ?? []) as TemplateRow[]) map.set(key(r.event, r.channel, r.locale), r);
  return { rows: map, requireApproval: setting?.value !== false };
}

/** Template for the locale, falling back to EN (master). */
export function findTemplate(
  index: TemplateIndex,
  event: string,
  channel: NotificationChannel,
  locale: NotificationLocale,
  approvedOnly: boolean
): TemplateRow | null {
  for (const l of locale === "en" ? ["en"] : [locale, "en"]) {
    const row = index.rows.get(key(event, channel, l));
    if (row && (!approvedOnly || row.approved) && (row.body.trim() !== "" || row.subject.trim() !== "")) return row;
  }
  return null;
}

export function renderTemplateRow(
  row: Pick<TemplateRow, "subject" | "body">,
  payload: Record<string, unknown>,
  locale: NotificationLocale
): { subject: string; body: string; lines: string[] } {
  const vars = buildTemplateVars(payload, locale);
  const subject = fillPlaceholders(row.subject, vars).trim();
  const body = fillPlaceholders(row.body, vars).trim();
  return { subject, body, lines: body.split(/\n{2,}/).map((l) => l.trim()).filter(Boolean) };
}
