import { createServiceRoleClient } from "@/lib/supabase/server";

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
    // --- homologation stream 1: Order Request / contact -----------------
    case "order_request_received": {
      const currency = (payload.currency as string) || "";
      const link = (payload.account_url as string) || "";
      return {
        subject: {
          en: `Order Request received${order ? ` — ${order}` : ""}`,
          es: `Solicitud de pedido recibida${order ? ` — ${order}` : ""}`,
          pt: `Order Request recebido${order ? ` — ${order}` : ""}`,
        }[locale],
        lines: [
          hi,
          {
            en: `We received your Order Request ${order}${currency ? ` (currency: ${currency})` : ""}. We are now confirming the availability of each item. No payment is required at this stage.`,
            es: `Recibimos tu solicitud de pedido ${order}${currency ? ` (moneda: ${currency})` : ""}. Ahora estamos confirmando la disponibilidad de cada artículo. No se requiere pago en esta etapa.`,
            pt: `Recebemos o seu pedido ${order}${currency ? ` (moeda: ${currency})` : ""}. Estamos confirmando a disponibilidade de cada item. Nenhum pagamento é necessário nesta etapa.`,
          }[locale],
          {
            en: "Freight and import duties are informed after stock confirmation, before you pay. You will be notified as soon as your confirmed order is ready for review.",
            es: "El flete y los aranceles se informan después de confirmar el stock, antes de que pagues. Te avisaremos en cuanto tu pedido confirmado esté listo para revisión.",
            pt: "Frete e impostos de importação são informados após a confirmação de estoque, antes do pagamento. Avisaremos assim que o seu pedido confirmado estiver pronto para revisão.",
          }[locale],
          link ? { en: `Follow your order in My account: ${link}`, es: `Sigue tu pedido en Mi cuenta: ${link}`, pt: `Acompanhe o pedido em Minha conta: ${link}` }[locale] : "",
        ],
      };
    }
    case "contact_received":
      return {
        subject: { en: "We received your message", es: "Recibimos tu mensaje", pt: "Recebemos sua mensagem" }[locale],
        lines: [
          hi,
          {
            en: "Thank you for contacting The Dressing Project. We received your message and our team will reply as soon as possible.",
            es: "Gracias por contactar a The Dressing Project. Recibimos tu mensaje y nuestro equipo responderá lo antes posible.",
            pt: "Obrigado por entrar em contato com a The Dressing Project. Recebemos sua mensagem e nossa equipe responderá o quanto antes.",
          }[locale],
          payload.message ? `“${String(payload.message).slice(0, 600)}”` : "",
        ],
      };
    case "contact_reply":
      return {
        subject: {
          en: `Re: ${(payload.subject as string) || "your message"}${order ? ` — ${order}` : ""}`,
          es: `Re: ${(payload.subject as string) || "tu mensaje"}${order ? ` — ${order}` : ""}`,
          pt: `Re: ${(payload.subject as string) || "sua mensagem"}${order ? ` — ${order}` : ""}`,
        }[locale],
        lines: [
          hi,
          String(payload.reply ?? ""),
          payload.original
            ? { en: `Your message:\n${String(payload.original).slice(0, 800)}`, es: `Tu mensaje:\n${String(payload.original).slice(0, 800)}`, pt: `Sua mensagem:\n${String(payload.original).slice(0, 800)}` }[locale]
            : "",
        ],
      };
    case "internal_new_contact":
      return {
        subject: `[TDP] Novo contato: ${(payload.subject as string) || ""} — ${(payload.sender as string) || ""}`,
        lines: [
          `Novo contato recebido de ${(payload.sender as string) || "?"} <${(payload.email as string) || "?"}>.`,
          `Assunto: ${(payload.subject as string) || ""}${order ? ` · Pedido: ${order}` : ""}`,
          String(payload.message ?? "").slice(0, 1500),
          payload.admin_url ? `Abrir no Admin: ${payload.admin_url}` : "",
        ],
      };
    case "internal_new_order":
      return {
        subject: `[TDP] Novo Order Request ${order}${payload.buyer ? ` — ${payload.buyer}` : ""}`,
        lines: [
          `Novo Order Request ${order} de ${(payload.buyer as string) || "?"}${payload.currency ? ` (${payload.currency})` : ""}.`,
          payload.total ? `Total de produtos: ${payload.total}` : "",
          payload.above_stock ? "ATENÇÃO: há itens acima do estoque disponível (veja o Action Center)." : "",
          payload.admin_url ? `Abrir no Admin: ${payload.admin_url}` : "",
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
  firstError?: string;
}

/** Sends queued rows (oldest first). Failed rows are marked and retried on later flushes (up to 5 attempts). */
export async function flushEmailOutbox(limit = 25): Promise<FlushResult> {
  const result: FlushResult = { configured: emailConfigured(), sent: 0, failed: 0 };
  if (!result.configured) return result;

  const supabase = createServiceRoleClient();
  const { data: rows } = await supabase
    .from("email_outbox")
    .select("id, to_email, template, locale, payload, status, error")
    .in("status", ["queued", "failed"])
    .order("created_at")
    .limit(limit);

  for (const row of rows ?? []) {
    const attempts = Number((row.payload as Payload)?._attempts ?? 0);
    if (row.status === "failed" && attempts >= 5) continue;
    const l = loc(row.locale);
    const rendered = render(row.template, l, (row.payload ?? {}) as Payload);
    if (!rendered) {
      await supabase.from("email_outbox").update({ status: "failed", error: `Unknown template ${row.template}`, payload: { ...(row.payload as Payload), _attempts: 5 } }).eq("id", row.id);
      result.failed++;
      continue;
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM,
          to: [row.to_email],
          reply_to: process.env.EMAIL_REPLY_TO || undefined,
          subject: rendered.subject,
          html: toHtml(rendered.lines, l),
          text: rendered.lines.filter(Boolean).join("\n\n"),
        }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
      await supabase.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", row.id);
      result.sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "send failed";
      await supabase.from("email_outbox").update({ status: "failed", error: message, payload: { ...(row.payload as Payload), _attempts: attempts + 1 } }).eq("id", row.id);
      result.failed++;
      result.firstError ??= message;
    }
  }
  return result;
}

/** Team addresses that receive internal notices (env TEAM_NOTIFY_EMAILS, comma/semicolon separated). */
export function teamNotifyEmails(): string[] {
  return (process.env.TEAM_NOTIFY_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

/** Public site origin used for links inside e-mails. */
export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
}

/** Queues one internal notice per team address (pt-BR). Never throws. */
export async function queueTeamNotice(template: "internal_new_order" | "internal_new_contact", payload: Payload): Promise<void> {
  try {
    const to = teamNotifyEmails();
    if (to.length === 0) return;
    const supabase = createServiceRoleClient();
    await supabase.from("email_outbox").insert(to.map((email) => ({ to_email: email, template, locale: "pt", payload })));
  } catch {
    /* a notice must never break the user's action */
  }
}

/** Queues a buyer-facing e-mail. Never throws; returns false when it could not be queued. */
export async function queueEmail(toEmail: string, template: string, locale: string | null | undefined, payload: Payload): Promise<boolean> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("email_outbox").insert({ to_email: toEmail, template, locale: loc(locale), payload });
    return !error;
  } catch {
    return false;
  }
}
