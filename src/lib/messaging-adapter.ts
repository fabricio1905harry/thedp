/**
 * WhatsApp / SMS adapter (integration seam).
 *
 * - No provider env vars  → MOCK: nothing leaves the server. The message is
 *   recorded as "queued" with provider "mock" so the TDP can see what would
 *   have been sent. It is never reported as sent.
 * - Twilio env vars       → real send through Twilio's REST API:
 *     TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 *     TWILIO_WHATSAPP_FROM (e.g. +14155238886)  → enables WhatsApp
 *     TWILIO_SMS_FROM      (e.g. +15551234567)  → enables SMS
 *   (WhatsApp Business templates must be approved on the provider side.)
 *
 * Swap the provider by adding another branch in sendMessage().
 */

export type MessagingChannel = "whatsapp" | "sms";

export interface MessagingResult {
  provider: "mock" | "twilio";
  status: "queued" | "sent" | "failed";
  providerRef?: string;
  error?: string;
}

export function messagingProvider(channel: MessagingChannel): "mock" | "twilio" {
  const base = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN;
  if (!base) return "mock";
  if (channel === "whatsapp" && process.env.TWILIO_WHATSAPP_FROM) return "twilio";
  if (channel === "sms" && process.env.TWILIO_SMS_FROM) return "twilio";
  return "mock";
}

/** E.164 from a free-form phone; null when the country code is missing. */
export function toE164(phone: string): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (trimmed.startsWith("00")) return `+${digits.slice(2)}`;
  return null;
}

export async function sendMessage(input: { channel: MessagingChannel; to: string; body: string }): Promise<MessagingResult> {
  const provider = messagingProvider(input.channel);
  if (provider === "mock") {
    return { provider: "mock", status: "queued", error: "Sem provedor configurado (modo MOCK): mensagem apenas registrada." };
  }

  const to = toE164(input.to);
  if (!to) return { provider: "twilio", status: "failed", error: "Telefone sem código do país (use +55…)." };
  const from = input.channel === "whatsapp" ? process.env.TWILIO_WHATSAPP_FROM! : process.env.TWILIO_SMS_FROM!;
  const prefix = input.channel === "whatsapp" ? "whatsapp:" : "";
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: `${prefix}${to}`, From: `${prefix}${from}`, Body: input.body }),
    });
    const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok) return { provider: "twilio", status: "failed", error: `Twilio ${res.status}: ${json.message ?? "erro"}`.slice(0, 300) };
    return { provider: "twilio", status: "sent", providerRef: json.sid };
  } catch (err) {
    return { provider: "twilio", status: "failed", error: err instanceof Error ? err.message : "falha no envio" };
  }
}
