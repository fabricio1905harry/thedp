/**
 * Floating WhatsApp button: settings (Admin → WhatsApp) and the contextual
 * message builder. Only product name/code + URL or the order number are
 * ever added — no personal data, prices or other sensitive information.
 */

export type WhatsAppLocale = "en" | "es" | "pt";
export type WhatsAppContextKind = "general" | "product" | "order";

export interface WhatsAppSettings {
  active: boolean;
  number: string;
  messages: Record<WhatsAppContextKind, Record<WhatsAppLocale, string>>;
}

export interface WhatsAppContext {
  kind: WhatsAppContextKind;
  product?: { name: string; code: string; url: string };
  orderNumber?: string;
}

export const DEFAULT_WHATSAPP_SETTINGS: WhatsAppSettings = {
  active: false,
  number: "",
  messages: {
    general: {
      en: "Hello! I would like more information about The Dressing Project.",
      es: "¡Hola! Me gustaría más información sobre The Dressing Project.",
      pt: "Olá! Gostaria de mais informações sobre o The Dressing Project.",
    },
    product: {
      en: "Hello! I am interested in this product: {product} — {url}",
      es: "¡Hola! Me interesa este producto: {product} — {url}",
      pt: "Olá! Tenho interesse neste produto: {product} — {url}",
    },
    order: {
      en: "Hello! I would like to talk about my order {order}.",
      es: "¡Hola! Me gustaría hablar sobre mi pedido {order}.",
      pt: "Olá! Gostaria de falar sobre o meu pedido {order}.",
    },
  },
};

export function normalizeWhatsAppSettings(value: unknown): WhatsAppSettings {
  const v = (value ?? {}) as Partial<WhatsAppSettings>;
  const messages = { ...DEFAULT_WHATSAPP_SETTINGS.messages };
  for (const kind of ["general", "product", "order"] as const) {
    messages[kind] = { ...DEFAULT_WHATSAPP_SETTINGS.messages[kind], ...(v.messages?.[kind] ?? {}) };
  }
  return {
    active: Boolean(v.active),
    number: String(v.number ?? "").replace(/\D/g, ""),
    messages,
  };
}

export function buildWhatsAppMessage(
  settings: WhatsAppSettings,
  locale: string,
  context: WhatsAppContext
): string {
  const loc = (["en", "es", "pt"].includes(locale) ? locale : "en") as WhatsAppLocale;
  const kind: WhatsAppContextKind =
    context.kind === "product" && context.product ? "product" : context.kind === "order" && context.orderNumber ? "order" : "general";
  const template = settings.messages[kind][loc] || settings.messages.general[loc];
  const productLabel = context.product
    ? context.product.code && context.product.code !== context.product.name
      ? `${context.product.name} (${context.product.code})`
      : context.product.name
    : "";
  return template
    .replaceAll("{product}", productLabel)
    .replaceAll("{url}", context.product?.url ?? "")
    .replaceAll("{order}", context.orderNumber ?? "");
}

export function whatsAppHref(settings: WhatsAppSettings, message: string): string {
  return `https://wa.me/${settings.number}?text=${encodeURIComponent(message)}`;
}
