/**
 * Notification events (e-mail / WhatsApp / SMS) and their DRAFT texts.
 *
 * The texts that are actually sent live in notification_templates and must
 * be approved by the TDP in Admin → Notificações (the client does not want
 * AI-translated messages at send time). The drafts below are only used by
 * the "Criar rascunhos padrão" button, which inserts the missing rows with
 * approved = false.
 *
 * Placeholders use {name}. Values come from the queued payload
 * (see buildTemplateVars).
 */

export type NotificationChannel = "email" | "whatsapp" | "sms";
export type NotificationLocale = "en" | "es" | "pt";

export const NOTIFICATION_CHANNELS: NotificationChannel[] = ["email", "whatsapp", "sms"];
export const NOTIFICATION_LOCALES: NotificationLocale[] = ["en", "es", "pt"];

export const CHANNEL_LABELS_PT: Record<NotificationChannel, string> = {
  email: "E-mail",
  whatsapp: "WhatsApp",
  sms: "SMS",
};

export const PLACEHOLDER_HELP: Record<string, string> = {
  buyer_name: "Nome do comprador",
  order_number: "Número do pedido",
  order_link: "Link da página do pedido",
  amount: "Valor (com moeda)",
  total: "Total do pedido (com moeda)",
  balance: "Saldo a pagar (com moeda)",
  due_date: "Data de vencimento do saldo",
  hold_until: "Fim da janela de pagamento",
  days: "Dias restantes",
  tracking_number: "Código de rastreio",
  tracking_link: "Link de rastreio",
  carrier: "Transportadora",
  cart_link: "Link para recuperar o carrinho",
  cart_items: "Lista de itens do carrinho",
  item_count: "Quantidade de peças",
  cart_total: "Valor do carrinho (com moeda)",
};

export interface NotificationEventDef {
  code: string;
  label: string;
  description: string;
  placeholders: string[];
  /** Channels shown in the admin matrix for this event. */
  channels: NotificationChannel[];
  group: string;
}

export const NOTIFICATION_EVENTS: NotificationEventDef[] = [
  { code: "order_request_received", group: "Pedido", label: "Order Request recebida", description: "Enviada quando o comprador envia o Order Request.", placeholders: ["buyer_name", "order_number", "order_link"], channels: ["email", "whatsapp"] },
  { code: "stock_confirmed", group: "Pedido", label: "Estoque confirmado / Confirmed Order pronto", description: "Enviada quando o pedido é liberado para pagamento.", placeholders: ["buyer_name", "order_number", "order_link", "total", "hold_until"], channels: ["email", "whatsapp", "sms"] },
  { code: "payment_window_expiring", group: "Pedido", label: "Janela de pagamento expirando (lembrete)", description: "Lembrete algumas horas antes de a reserva de estoque expirar (horas configuráveis).", placeholders: ["buyer_name", "order_number", "order_link", "hold_until"], channels: ["email", "whatsapp", "sms"] },
  { code: "payment_window_expired", group: "Pedido", label: "Janela de pagamento expirada", description: "Enviada quando o prazo de pagamento vence e o estoque é liberado.", placeholders: ["buyer_name", "order_number", "order_link"], channels: ["email", "whatsapp"] },
  { code: "payment_received", group: "Pagamento", label: "Pagamento recebido", description: "Enviada quando um pagamento (integral ou saldo) é confirmado.", placeholders: ["buyer_name", "order_number", "order_link", "amount"], channels: ["email", "whatsapp", "sms"] },
  { code: "reserve_confirmed", group: "Reserve", label: "Reserve confirmada (depósito recebido)", description: "Enviada quando o depósito do Reserve for Later Delivery é confirmado.", placeholders: ["buyer_name", "order_number", "order_link", "amount", "due_date"], channels: ["email", "whatsapp"] },
  { code: "reserve_reminder_14", group: "Reserve", label: "Reserve: saldo vence em 14 dias", description: "Lembrete 14 dias antes do vencimento do saldo.", placeholders: ["buyer_name", "order_number", "order_link", "due_date", "balance", "days"], channels: ["email", "whatsapp"] },
  { code: "reserve_reminder_8", group: "Reserve", label: "Reserve: saldo vence em 8 dias", description: "Lembrete 8 dias antes do vencimento do saldo.", placeholders: ["buyer_name", "order_number", "order_link", "due_date", "balance", "days"], channels: ["email", "whatsapp"] },
  { code: "reserve_reminder_7", group: "Reserve", label: "Reserve: saldo vence em 7 dias", description: "Lembrete 7 dias antes do vencimento do saldo.", placeholders: ["buyer_name", "order_number", "order_link", "due_date", "balance", "days"], channels: ["email", "whatsapp", "sms"] },
  { code: "reserve_overdue", group: "Reserve", label: "Reserve: saldo em atraso", description: "Enviada quando a data de vencimento passa sem o saldo pago.", placeholders: ["buyer_name", "order_number", "order_link", "due_date"], channels: ["email", "whatsapp"] },
  { code: "reserve_expired", group: "Reserve", label: "Reserve: prazo máximo (180 dias) expirado", description: "Enviada quando a janela máxima de reserva termina sem o pagamento do saldo.", placeholders: ["buyer_name", "order_number", "order_link"], channels: ["email"] },
  { code: "shipment_created", group: "Envio", label: "Envio criado", description: "Enviada quando o envio DHL é criado (nunca para envios MOCK).", placeholders: ["buyer_name", "order_number", "order_link", "tracking_number", "tracking_link", "carrier"], channels: ["email", "whatsapp"] },
  { code: "in_transit", group: "Envio", label: "Pedido em trânsito", description: "Enviada quando a DHL coleta o pedido.", placeholders: ["buyer_name", "order_number", "order_link", "tracking_number", "tracking_link", "carrier"], channels: ["email", "whatsapp", "sms"] },
  { code: "delivered", group: "Envio", label: "Pedido entregue", description: "Enviada quando a entrega é confirmada.", placeholders: ["buyer_name", "order_number", "order_link"], channels: ["email", "whatsapp"] },
  { code: "abandoned_cart_1", group: "Carrinho", label: "Carrinho abandonado — e-mail 1", description: "Primeiro lembrete após o tempo de inatividade configurado (padrão 2 h).", placeholders: ["buyer_name", "cart_link", "cart_items", "item_count", "cart_total"], channels: ["email"] },
  { code: "abandoned_cart_2", group: "Carrinho", label: "Carrinho abandonado — e-mail 2", description: "Segundo lembrete após o tempo configurado (padrão 24 h).", placeholders: ["buyer_name", "cart_link", "cart_items", "item_count", "cart_total"], channels: ["email"] },
];

export const EVENT_BY_CODE: Record<string, NotificationEventDef> = Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e.code, e]));

type Draft = { subject: string; body: string };
type DraftSet = Record<NotificationLocale, Draft>;

const L = (en: Draft, es: Draft, pt: Draft): DraftSet => ({ en, es, pt });

const HI = { en: "Hello {buyer_name},", es: "Hola {buyer_name},", pt: "Olá {buyer_name}," };

function email(
  subject: [string, string, string],
  paragraphs: [string[], string[], string[]]
): DraftSet {
  const loc: NotificationLocale[] = ["en", "es", "pt"];
  const out = {} as DraftSet;
  loc.forEach((l, i) => {
    out[l] = { subject: subject[i], body: [HI[l], ...paragraphs[i]].join("\n\n") };
  });
  return out;
}

/** Draft e-mail texts (en master / es / pt). Never sent until approved. */
export const EMAIL_DRAFTS: Record<string, DraftSet> = {
  order_request_received: email(
    ["Order Request received — {order_number}", "Solicitud de pedido recibida — {order_number}", "Order Request recebida — {order_number}"],
    [
      ["We received your Order Request {order_number}. Availability will be confirmed before payment — nothing is charged yet.", "Track it here: {order_link}"],
      ["Recibimos tu solicitud de pedido {order_number}. La disponibilidad se confirmará antes del pago; todavía no se cobra nada.", "Síguela aquí: {order_link}"],
      ["Recebemos o seu Order Request {order_number}. A disponibilidade será confirmada antes do pagamento — nada foi cobrado ainda.", "Acompanhe aqui: {order_link}"],
    ]
  ),
  stock_confirmed: email(
    ["Your Confirmed Order is ready — {order_number}", "Tu pedido confirmado está listo — {order_number}", "Seu Confirmed Order está pronto — {order_number}"],
    [
      ["Stock for order {order_number} is confirmed. Total: {total}. Your pieces are held until {hold_until}.", "Review and pay here: {order_link}"],
      ["El stock del pedido {order_number} está confirmado. Total: {total}. Tus piezas están reservadas hasta {hold_until}.", "Revisa y paga aquí: {order_link}"],
      ["O estoque do pedido {order_number} foi confirmado. Total: {total}. Suas peças estão reservadas até {hold_until}.", "Confira e pague aqui: {order_link}"],
    ]
  ),
  payment_window_expiring: email(
    ["Your payment window ends soon — {order_number}", "Tu plazo de pago vence pronto — {order_number}", "Seu prazo de pagamento termina em breve — {order_number}"],
    [
      ["The payment window for order {order_number} ends on {hold_until}. After that the pieces are released.", "Pay here: {order_link}"],
      ["El plazo de pago del pedido {order_number} vence el {hold_until}. Después, las piezas se liberan.", "Paga aquí: {order_link}"],
      ["O prazo de pagamento do pedido {order_number} termina em {hold_until}. Depois disso as peças são liberadas.", "Pague aqui: {order_link}"],
    ]
  ),
  payment_window_expired: email(
    ["Payment window expired — {order_number}", "Plazo de pago vencido — {order_number}", "Prazo de pagamento expirado — {order_number}"],
    [
      ["The payment window for order {order_number} has expired and the pieces are no longer held. Reply to this e-mail and we will check availability again."],
      ["El plazo de pago del pedido {order_number} venció y las piezas ya no están reservadas. Responde a este e-mail y volveremos a verificar la disponibilidad."],
      ["O prazo de pagamento do pedido {order_number} expirou e as peças não estão mais reservadas. Responda a este e-mail e verificaremos a disponibilidade novamente."],
    ]
  ),
  payment_received: email(
    ["Payment received — {order_number}", "Pago recibido — {order_number}", "Pagamento recebido — {order_number}"],
    [
      ["We received your payment of {amount} for order {order_number}. Thank you!", "Order status: {order_link}"],
      ["Recibimos tu pago de {amount} del pedido {order_number}. ¡Gracias!", "Estado del pedido: {order_link}"],
      ["Recebemos o seu pagamento de {amount} do pedido {order_number}. Obrigado!", "Status do pedido: {order_link}"],
    ]
  ),
  reserve_confirmed: email(
    ["Reserve confirmed — {order_number}", "Reserva confirmada — {order_number}", "Reserve confirmada — {order_number}"],
    [
      ["Your deposit of {amount} was received and your Reserve for Later Delivery for order {order_number} is confirmed.", "Schedule and balance: {order_link}"],
      ["Recibimos tu depósito de {amount} y tu Reserve for Later Delivery del pedido {order_number} está confirmada.", "Calendario y saldo: {order_link}"],
      ["Recebemos o seu depósito de {amount} e o Reserve for Later Delivery do pedido {order_number} está confirmado.", "Cronograma e saldo: {order_link}"],
    ]
  ),
  reserve_reminder_14: email(
    ["Balance due in {days} days — {order_number}", "Saldo vence en {days} días — {order_number}", "Saldo vence em {days} dias — {order_number}"],
    [
      ["The balance of {balance} for order {order_number} is due on {due_date}.", "Pay here: {order_link}"],
      ["El saldo de {balance} del pedido {order_number} vence el {due_date}.", "Paga aquí: {order_link}"],
      ["O saldo de {balance} do pedido {order_number} vence em {due_date}.", "Pague aqui: {order_link}"],
    ]
  ),
  reserve_reminder_8: email(
    ["Balance due in {days} days — {order_number}", "Saldo vence en {days} días — {order_number}", "Saldo vence em {days} dias — {order_number}"],
    [
      ["Reminder: the balance of {balance} for order {order_number} is due on {due_date}.", "Pay here: {order_link}"],
      ["Recordatorio: el saldo de {balance} del pedido {order_number} vence el {due_date}.", "Paga aquí: {order_link}"],
      ["Lembrete: o saldo de {balance} do pedido {order_number} vence em {due_date}.", "Pague aqui: {order_link}"],
    ]
  ),
  reserve_reminder_7: email(
    ["Last week to pay the balance — {order_number}", "Última semana para pagar el saldo — {order_number}", "Última semana para pagar o saldo — {order_number}"],
    [
      ["The balance of {balance} for order {order_number} is due on {due_date}. Please complete the payment so we can ship on time.", "Pay here: {order_link}"],
      ["El saldo de {balance} del pedido {order_number} vence el {due_date}. Completa el pago para enviar a tiempo.", "Paga aquí: {order_link}"],
      ["O saldo de {balance} do pedido {order_number} vence em {due_date}. Conclua o pagamento para enviarmos no prazo.", "Pague aqui: {order_link}"],
    ]
  ),
  reserve_overdue: email(
    ["Balance overdue — {order_number}", "Saldo vencido — {order_number}", "Saldo em atraso — {order_number}"],
    [
      ["The balance for order {order_number} was due on {due_date} and is still open. Please contact us to arrange payment.", "Order: {order_link}"],
      ["El saldo del pedido {order_number} vencía el {due_date} y sigue pendiente. Contáctanos para coordinar el pago.", "Pedido: {order_link}"],
      ["O saldo do pedido {order_number} venceu em {due_date} e continua em aberto. Entre em contato para combinarmos o pagamento.", "Pedido: {order_link}"],
    ]
  ),
  reserve_expired: email(
    ["Reserve period ended — {order_number}", "Plazo de reserva finalizado — {order_number}", "Prazo da reserva encerrado — {order_number}"],
    [
      ["The maximum reserve period for order {order_number} has ended without the balance being paid. Please contact us to decide the next steps."],
      ["El plazo máximo de reserva del pedido {order_number} terminó sin que se pagara el saldo. Contáctanos para decidir los próximos pasos."],
      ["O prazo máximo de reserva do pedido {order_number} terminou sem o pagamento do saldo. Entre em contato para decidirmos os próximos passos."],
    ]
  ),
  shipment_created: email(
    ["Your order is being shipped — {order_number}", "Tu pedido está siendo enviado — {order_number}", "Seu pedido está sendo enviado — {order_number}"],
    [
      ["Your shipment for order {order_number} was created with {carrier}. Tracking number: {tracking_number}", "Track: {tracking_link}"],
      ["El envío de tu pedido {order_number} fue creado con {carrier}. Número de seguimiento: {tracking_number}", "Seguimiento: {tracking_link}"],
      ["O envio do seu pedido {order_number} foi criado com a {carrier}. Código de rastreio: {tracking_number}", "Rastreie: {tracking_link}"],
    ]
  ),
  in_transit: email(
    ["Your order is on its way — {order_number}", "Tu pedido está en camino — {order_number}", "Seu pedido está a caminho — {order_number}"],
    [
      ["{carrier} picked up order {order_number}. Tracking number: {tracking_number}", "Track: {tracking_link}"],
      ["{carrier} recogió el pedido {order_number}. Número de seguimiento: {tracking_number}", "Seguimiento: {tracking_link}"],
      ["A {carrier} coletou o pedido {order_number}. Código de rastreio: {tracking_number}", "Rastreie: {tracking_link}"],
    ]
  ),
  delivered: email(
    ["Order delivered — {order_number}", "Pedido entregado — {order_number}", "Pedido entregue — {order_number}"],
    [
      ["Order {order_number} was delivered. We hope you love it!", "Order: {order_link}"],
      ["El pedido {order_number} fue entregado. ¡Esperamos que te encante!", "Pedido: {order_link}"],
      ["O pedido {order_number} foi entregue. Esperamos que você ame!", "Pedido: {order_link}"],
    ]
  ),
  abandoned_cart_1: email(
    ["You left something in your cart", "Dejaste algo en tu carrito", "Você deixou algo no carrinho"],
    [
      ["You have {item_count} piece(s) waiting in your cart:", "{cart_items}", "Pick up where you left off: {cart_link}"],
      ["Tienes {item_count} pieza(s) esperando en tu carrito:", "{cart_items}", "Continúa donde lo dejaste: {cart_link}"],
      ["Você tem {item_count} peça(s) esperando no carrinho:", "{cart_items}", "Continue de onde parou: {cart_link}"],
    ]
  ),
  abandoned_cart_2: email(
    ["Still thinking it over? Your cart is waiting", "¿Todavía lo estás pensando? Tu carrito te espera", "Ainda pensando? Seu carrinho está esperando"],
    [
      ["Your selection ({cart_total}) is still in your cart. Availability is confirmed only after you send your Order Request.", "{cart_items}", "Resume: {cart_link}"],
      ["Tu selección ({cart_total}) sigue en el carrito. La disponibilidad solo se confirma después de enviar tu solicitud de pedido.", "{cart_items}", "Retomar: {cart_link}"],
      ["Sua seleção ({cart_total}) continua no carrinho. A disponibilidade só é confirmada depois que você envia o Order Request.", "{cart_items}", "Retomar: {cart_link}"],
    ]
  ),
};

/** Short drafts for WhatsApp / SMS (no subject). */
function short(en: string, es: string, pt: string): DraftSet {
  return L({ subject: "", body: en }, { subject: "", body: es }, { subject: "", body: pt });
}

export const SHORT_DRAFTS: Record<string, DraftSet> = {
  order_request_received: short(
    "The Dressing Project: we received your Order Request {order_number}. Availability is confirmed before payment. {order_link}",
    "The Dressing Project: recibimos tu solicitud de pedido {order_number}. La disponibilidad se confirma antes del pago. {order_link}",
    "The Dressing Project: recebemos seu Order Request {order_number}. A disponibilidade é confirmada antes do pagamento. {order_link}"
  ),
  stock_confirmed: short(
    "The Dressing Project: your Confirmed Order {order_number} is ready ({total}). Held until {hold_until}. {order_link}",
    "The Dressing Project: tu pedido confirmado {order_number} está listo ({total}). Reservado hasta {hold_until}. {order_link}",
    "The Dressing Project: seu Confirmed Order {order_number} está pronto ({total}). Reservado até {hold_until}. {order_link}"
  ),
  payment_window_expiring: short(
    "The Dressing Project: payment window for {order_number} ends {hold_until}. {order_link}",
    "The Dressing Project: el plazo de pago de {order_number} vence {hold_until}. {order_link}",
    "The Dressing Project: o prazo de pagamento de {order_number} termina {hold_until}. {order_link}"
  ),
  payment_window_expired: short(
    "The Dressing Project: the payment window for {order_number} expired. Reply here and we will check availability again.",
    "The Dressing Project: el plazo de pago de {order_number} venció. Responde aquí y verificaremos la disponibilidad.",
    "The Dressing Project: o prazo de pagamento de {order_number} expirou. Responda aqui e verificaremos a disponibilidade."
  ),
  payment_received: short(
    "The Dressing Project: payment of {amount} received for {order_number}. Thank you!",
    "The Dressing Project: pago de {amount} recibido para {order_number}. ¡Gracias!",
    "The Dressing Project: pagamento de {amount} recebido para {order_number}. Obrigado!"
  ),
  reserve_confirmed: short(
    "The Dressing Project: Reserve confirmed for {order_number}. {order_link}",
    "The Dressing Project: Reserva confirmada para {order_number}. {order_link}",
    "The Dressing Project: Reserve confirmada para {order_number}. {order_link}"
  ),
  reserve_reminder_14: short(
    "The Dressing Project: balance of {balance} for {order_number} is due {due_date}. {order_link}",
    "The Dressing Project: el saldo de {balance} de {order_number} vence {due_date}. {order_link}",
    "The Dressing Project: saldo de {balance} do pedido {order_number} vence em {due_date}. {order_link}"
  ),
  reserve_reminder_8: short(
    "The Dressing Project: balance of {balance} for {order_number} is due {due_date}. {order_link}",
    "The Dressing Project: el saldo de {balance} de {order_number} vence {due_date}. {order_link}",
    "The Dressing Project: saldo de {balance} do pedido {order_number} vence em {due_date}. {order_link}"
  ),
  reserve_reminder_7: short(
    "The Dressing Project: 7 days left to pay the balance of {order_number} ({balance}). {order_link}",
    "The Dressing Project: faltan 7 días para pagar el saldo de {order_number} ({balance}). {order_link}",
    "The Dressing Project: faltam 7 dias para pagar o saldo de {order_number} ({balance}). {order_link}"
  ),
  reserve_overdue: short(
    "The Dressing Project: the balance of {order_number} (due {due_date}) is overdue. Please contact us.",
    "The Dressing Project: el saldo de {order_number} (vencía {due_date}) está vencido. Contáctanos.",
    "The Dressing Project: o saldo do pedido {order_number} (venceu em {due_date}) está em atraso. Entre em contato."
  ),
  shipment_created: short(
    "The Dressing Project: order {order_number} shipped with {carrier}. Tracking: {tracking_number} {tracking_link}",
    "The Dressing Project: pedido {order_number} enviado con {carrier}. Seguimiento: {tracking_number} {tracking_link}",
    "The Dressing Project: pedido {order_number} enviado pela {carrier}. Rastreio: {tracking_number} {tracking_link}"
  ),
  in_transit: short(
    "The Dressing Project: order {order_number} is on its way. Tracking: {tracking_number} {tracking_link}",
    "The Dressing Project: pedido {order_number} en camino. Seguimiento: {tracking_number} {tracking_link}",
    "The Dressing Project: pedido {order_number} a caminho. Rastreio: {tracking_number} {tracking_link}"
  ),
  delivered: short(
    "The Dressing Project: order {order_number} was delivered.",
    "The Dressing Project: el pedido {order_number} fue entregado.",
    "The Dressing Project: o pedido {order_number} foi entregue."
  ),
};

export function defaultDraft(event: string, channel: NotificationChannel, locale: NotificationLocale): Draft | null {
  const set = channel === "email" ? EMAIL_DRAFTS[event] : SHORT_DRAFTS[event];
  return set?.[locale] ?? null;
}

// ---------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------

const DATE_LOCALE: Record<NotificationLocale, string> = { en: "en-US", es: "es-ES", pt: "pt-BR" };

function fmtDate(value: unknown, locale: NotificationLocale, withTime = false): string {
  if (!value) return "";
  const d = new Date(String(value).length === 10 ? `${value}T12:00:00Z` : String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  // date-only values (noon UTC) keep their calendar day; timestamps are shown in Brasília time
  const BRASILIA = { en: "Brasília time", es: "hora de Brasilia", pt: "horário de Brasília" }[locale];
  return withTime
    ? `${d.toLocaleString(DATE_LOCALE[locale], { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" })} (${BRASILIA})`
    : d.toLocaleString(DATE_LOCALE[locale], { dateStyle: "medium", timeZone: "UTC" });
}

function fmtMoney(value: unknown, currency: unknown, locale: NotificationLocale): string {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) return "";
  const cur = typeof currency === "string" && currency.length === 3 ? currency : "USD";
  try {
    return new Intl.NumberFormat(DATE_LOCALE[locale], { style: "currency", currency: cur }).format(n);
  } catch {
    return `${n.toFixed(2)} ${cur}`;
  }
}

export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
}

/** Builds the {placeholder} values for a queued payload. Missing values become "". */
export function buildTemplateVars(payload: Record<string, unknown>, locale: NotificationLocale): Record<string, string> {
  const origin = siteOrigin();
  const currency = payload.currency;
  const orderId = payload.order_id ? String(payload.order_id) : "";
  const vars: Record<string, string> = {
    buyer_name: String(payload.buyer_name ?? ""),
    order_number: String(payload.order_number ?? ""),
    order_link: orderId ? `${origin}/${locale}/pedidos/${orderId}` : "",
    amount: fmtMoney(payload.amount, currency, locale),
    total: fmtMoney(payload.total, currency, locale),
    balance: fmtMoney(payload.balance, currency, locale),
    due_date: fmtDate(payload.due_date, locale),
    hold_until: fmtDate(payload.stock_hold_until, locale, true),
    days: payload.days !== undefined ? String(payload.days) : "",
    tracking_number: String(payload.tracking_number ?? ""),
    tracking_link: String(payload.tracking_url ?? ""),
    carrier: String(payload.carrier ?? "DHL"),
    cart_link: payload.cart_token ? `${origin}/${locale}/carrinho/recuperar?token=${payload.cart_token}` : "",
    cart_items: String(payload.cart_items_text ?? ""),
    item_count: payload.item_count !== undefined ? String(payload.item_count) : "",
    cart_total: fmtMoney(payload.cart_total, currency, locale),
  };
  return vars;
}

export function fillPlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{([a-z_]+)\}/g, (_m, key: string) => (key in vars ? vars[key] : `{${key}}`));
}

/** Placeholders in `text` that are not valid for this event (used by the editor). */
export function unknownPlaceholders(text: string, allowed: string[]): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\{([a-zA-Z_]+)\}/g)) {
    if (!allowed.includes(m[1])) found.add(m[1]);
  }
  return [...found];
}

/** Sample values for previews / test e-mails. */
export function samplePayload(): Record<string, unknown> {
  const in3 = new Date(Date.now() + 3 * 86400000).toISOString();
  return {
    buyer_name: "Maria",
    order_number: "TDP-000123",
    order_id: "00000000-0000-0000-0000-000000000000",
    currency: "USD",
    amount: 1250,
    total: 4180,
    balance: 2930,
    due_date: in3.slice(0, 10),
    stock_hold_until: in3,
    days: 8,
    tracking_number: "MOCK-1234567890",
    tracking_url: "https://www.dhl.com/global-en/home/tracking.html?tracking-id=1234567890",
    carrier: "DHL",
    cart_token: "00000000-0000-0000-0000-000000000000",
    cart_items_text: "- Linen Midi Dress · Ivory / M × 6\n- Silk Slip Dress · Black / S × 4",
    item_count: 10,
    cart_total: 2480,
  };
}
