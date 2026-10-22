export const ORDER_STATUS_LABELS: Record<string, string> = {
  created: "Criado",
  order_request: "Order Request",
  stock_confirmation: "Confirmando estoque",
  awaiting_buyer_decision: "Aguardando decisão do comprador",
  confirmed_awaiting_payment: "Confirmed Order — aguardando pagamento",
  payment_coordination_required: "Disponibilidade confirmada — coordenação de pagamento necessária",
  payment_window_expired: "Prazo de pagamento expirado",
  reserved: "Reservado (Reserve Order)",
  paid: "Pago",
  processing: "Em Separação",
  shipped: "Enviado",
  delivered: "Entregue",
  canceled: "Cancelado",
};

/** Statuses in which the TDP can still edit the order composition. */
export const EDITABLE_ORDER_STATUSES = [
  "created",
  "order_request",
  "stock_confirmation",
  "awaiting_buyer_decision",
  "payment_window_expired",
  "payment_coordination_required",
];

export const ITEM_STATUS_LABELS: Record<string, string> = {
  requested: "Solicitado",
  available: "DISPONÍVEL",
  unavailable_out_of_stock: "INDISPONÍVEL — SEM ESTOQUE",
  unavailable_order_only: "INDISPONÍVEL — SOB ENCOMENDA / OUTRO MOTIVO",
  removed: "Removido",
};

export const STOCK_HOLD_LABELS: Record<string, string> = {
  "24h": "24h",
  "48h": "48h",
  custom: "Personalizado (TDP define data/hora)",
  cannot_reserve: "Reserva impossível",
};

/** Buyer-facing status → message key in the "order" namespace. */
export const BUYER_STATUS_KEYS: Record<string, string> = {
  created: "statusOrderRequest",
  order_request: "statusOrderRequest",
  stock_confirmation: "statusStockConfirmation",
  awaiting_buyer_decision: "statusAwaitingDecision",
  confirmed_awaiting_payment: "statusAwaitingPayment",
  payment_coordination_required: "statusCoordination",
  payment_window_expired: "statusExpired",
  reserved: "statusReserved",
  paid: "statusPaid",
  processing: "statusProcessing",
  shipped: "statusShipped",
  delivered: "statusDelivered",
  canceled: "statusCanceled",
};

/** Statuses in which the buyer may still cancel the Order Request (before any payment). */
export const BUYER_CANCELABLE_STATUSES = ["created", "order_request", "stock_confirmation", "awaiting_buyer_decision"];

/** Statuses where the order has been released (Confirmed Order) and freight/duties may be shown to the buyer. */
export const BUYER_RELEASED_STATUSES = [
  "confirmed_awaiting_payment",
  "payment_coordination_required",
  "payment_window_expired",
  "reserved",
  "paid",
  "processing",
  "shipped",
  "delivered",
];
