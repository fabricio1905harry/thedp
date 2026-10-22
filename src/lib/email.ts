import { createServiceRoleClient } from "@/lib/supabase/server";
import { findTemplate, loadTemplateIndex, renderTemplateRow } from "@/lib/notification-templates";

/**
 * Transactional e-mail. Rows queue in email_outbox (status queued) and are
 * sent through Resend's REST API when RESEND_API_KEY and EMAIL_FROM are set.
 * Nothing is lost when the provider is not configured: rows stay queued and
 * go out on the next flush (hourly cron or the next admin action).
 */

type Locale = "en" | "es" | "pt";
type Payload = Record<string, unknown>;

const SIGN: Record<Locale, string> = {
  en: "The Dressing Project",
  es: "The Dressing Project",
  pt: "The Dressing Project",
};

function loc(l: string | null | undefined): Locale {
  return l === "es" || l === "pt" ? l : "en";
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface Rendered {
  subject: string;
  lines: string[];
}

function render(template: string, locale: Locale, payload: Payload): Rendered | null {
  const name = (payload.buyer_name as string) || "";
  const note = (payload.note as string) || "";
  const order = (payload.order_number as string) || "";
  const hi = { en: `Hello${name ? ` ${name}` : ""},`, es: `Hola${name ? ` ${name}` : ""},`, pt: `Olá${name ? ` ${name}` : ""},` }[locale];

  switch (template) {
    case "wholesale_account_approved":
      return {
        subject: { en: "Your wholesale account is approved", es: "Tu cuenta mayorista fue aprobada", pt: "Sua conta de atacado foi aprovada" }[locale],
        lines: [
          hi,
          {
            en: "Your wholesale account at The Dressing Project has been approved. You can now sign in to see wholesale prices and place your order requests.",
            es: "Tu cuenta mayorista en The Dressing Project fue aprobada. Ya puedes iniciar sesión para ver los precios mayoristas y enviar tus solicitudes de pedido.",
            pt: "Sua conta de atacado na The Dressing Project foi aprovada. Agora você já pode entrar para ver os preços de atacado e enviar seus pedidos.",
          }[locale],
        ],
      };
    case "wholesale_more_info":
      return {
        subject: { en: "More information needed for your wholesale application", es: "Necesitamos más información para tu solicitud mayorista", pt: "Precisamos de mais informações para o seu cadastro de atacado" }[locale],
        lines: [
          hi,
          {
            en: "To continue reviewing your wholesale application we need a bit more information:",
            es: "Para seguir revisando tu solicitud mayorista necesitamos un poco más de información:",
            pt: "Para continuar a análise do seu cadastro de atacado precisamos de mais algumas informações:",
          }[locale],
          note,
          {
            en: "Just reply to this e-mail with the details.",
            es: "Solo responde a este e-mail con los datos.",
            pt: "Basta responder a este e-mail com os dados.",
          }[locale],
        ],
      };
    case "payment_window_expired":
      return {
        subject: { en: `Payment window expired${order ? ` — ${order}` : ""}`, es: `Plazo de pago vencido${order ? ` — ${order}` : ""}`, pt: `Prazo de pagamento expirado${order ? ` — ${order}` : ""}` }[locale],
        lines: [
          hi,
          {
            en: `The payment window for your order ${order} has expired and the pieces are no longer held. Reply to this e-mail and we will check availability again.`,
            es: `El plazo de pago de tu pedido ${order} venció y las piezas ya no están reservadas. Responde a este e-mail y volveremos a verificar la disponibilidad.`,
            pt: `O prazo de pagamento do seu pedido ${order} expirou e as peças não estão mais reservadas. Responda a este e-mail e verificaremos a disponibilidade novamente.`,
          }[locale],
        ],
      };
    default:
      return null;
  }
}

function toHtml(lines: string[], locale: Locale) {
  const body = lines.filter(Boolean).map((l) => `<p style="margin:0 0 14px">${escapeHtml(l).replace(/\n/g, "<br>")}</p>`).join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111;max-width:560px">${body}<p style="margin:24px 0 0;letter-spacing:.08em;text-transform:uppercase;font-size:12px">${SIGN[locale]}</p></div>`;
}

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export interface FlushResult {
  configured: boolean;
  sent: number;
  failed: number;
  held?: number;
  firstError?: string;
}

/** One e-mail through Resend. Returns an error message instead of throwing. Never pretends success. */
export async function sendEmailNow(input: { to: string; subject: string; lines: string[]; locale: string }): Promise<{ error?: string }> {
  if (!emailConfigured()) return { error: "Provedor de e-mail não configurado (RESEND_API_KEY e EMAIL_FROM)." };
  const l = loc(input.locale);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [input.to],
        reply_to: process.env.EMAIL_REPLY_TO || undefined,
        subject: input.subject,
        html: toHtml(input.lines, l),
        text: input.lines.filter(Boolean).join("\n\n"),
      }),
    });
    if (!res.ok) return { error: `Resend ${res.status}: ${(await res.text()).slice(0, 300)}` };
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "send failed" };
  }
}

/**
 * Sends queued rows (oldest first). Failed rows are marked and retried on later flushes (up to 5 attempts).
 * Template lookup: approved database template (Admin → Notificações) → template in code → database draft
 * (only when approval is not required). A row whose only template is an unapproved draft stays queued.
 */
export async function flushEmailOutbox(limit = 25): Promise<FlushResult> {
  const result: FlushResult = { configured: emailConfigured(), sent: 0, failed: 0, held: 0 };
  if (!result.configured) return result;

  const supabase = createServiceRoleClient();
  const [{ data: rows }, templates] = await Promise.all([
    supabase
      .from("email_outbox")
      .select("id, to_email, template, locale, payload, status, error")
      .in("status", ["queued", "failed"])
      .order("created_at")
      .limit(limit * 4),
    loadTemplateIndex(supabase),
  ]);

  async function logOutcome(outboxId: string, row: { to_email: string; template: string; locale: string; payload: unknown }, status: "sent" | "failed" | "queued", error: string | null, rendered?: Rendered) {
    const patch = {
      status,
      error,
      provider: "resend",
      subject: rendered?.subject ?? null,
      body: rendered ? rendered.lines.filter(Boolean).join("\n\n") : null,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    };
    const { data } = await supabase.from("notification_log").update(patch).eq("email_outbox_id", outboxId).select("id");
    if (!data || data.length === 0) {
      // queued by code that predates the notifications engine: record it now
      const p = (row.payload ?? {}) as Payload;
      await supabase.from("notification_log").insert({
        event: row.template,
        channel: "email",
        locale: loc(row.locale),
        to_address: row.to_email,
        order_id: typeof p.order_id === "string" ? p.order_id : null,
        payload: p,
        email_outbox_id: outboxId,
        ...patch,
      });
    }
  }

  for (const row of rows ?? []) {
    if (result.sent + result.failed >= limit) break;
    const attempts = Number((row.payload as Payload)?._attempts ?? 0);
    if (row.status === "failed" && attempts >= 5) continue;
    const l = loc(row.locale);
    const payload = (row.payload ?? {}) as Payload;

    let rendered: Rendered | null = null;
    const approved = findTemplate(templates, row.template, "email", l, true);
    if (approved) {
      const r = renderTemplateRow(approved, payload, l);
      rendered = { subject: r.subject, lines: r.lines };
    } else {
      rendered = render(row.template, l, payload);
      if (!rendered) {
        const draft = findTemplate(templates, row.template, "email", l, false);
        if (draft && !templates.requireApproval) {
          const r = renderTemplateRow(draft, payload, l);
          rendered = { subject: r.subject, lines: r.lines };
        } else if (draft) {
          // only an unapproved draft exists: hold (stays queued) until the TDP approves it
          result.held = (result.held ?? 0) + 1;
          await logOutcome(row.id, row, "queued", "Aguardando aprovação do template (Admin → Notificações)");
          continue;
        }
      }
    }
    if (!rendered) {
      await supabase.from("email_outbox").update({ status: "failed", error: `Unknown template ${row.template}`, payload: { ...payload, _attempts: 5 } }).eq("id", row.id);
      await logOutcome(row.id, row, "failed", `Template inexistente: ${row.template}`);
      result.failed++;
      continue;
    }

    const sent = await sendEmailNow({ to: row.to_email, subject: rendered.subject, lines: rendered.lines, locale: l });
    if (!sent.error) {
      await supabase.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", row.id);
      await logOutcome(row.id, row, "sent", null, rendered);
      result.sent++;
    } else {
      await supabase.from("email_outbox").update({ status: "failed", error: sent.error, payload: { ...payload, _attempts: attempts + 1 } }).eq("id", row.id);
      await logOutcome(row.id, row, "failed", sent.error, rendered);
      result.failed++;
      result.firstError ??= sent.error;
    }
  }
  return result;
}
