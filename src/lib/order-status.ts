export const ORDER_STATUS_LABELS: Record<string, string> = {
  created: "Criado",
  order_request: "Order Request",
  stock_confirmation: "Confirmando estoque",
  awaiting_buyer_decision: "Aguardando decisão do buyer",
  confirmed_awaiting_payment: "Confirmed Order — aguardando pagamento",
  payment_coordination_required: "Availability confirmed — payment coordination required",
  payment_window_expired: "Payment window expired",
  reserved: "Reserved (Reserve Order)",
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
  requested: "Requested",
  available: "AVAILABLE",
  unavailable_out_of_stock: "UNAVAILABLE — OUT OF STOCK",
  unavailable_order_only: "UNAVAILABLE — ORDER ONLY / OTHER REASON",
  removed: "Removed",
};

export const STOCK_HOLD_LABELS: Record<string, string> = {
  "24h": "24h",
  "48h": "48h",
  custom: "Custom (TDP sets date/time)",
  cannot_reserve: "Cannot Reserve / Reserva impossível",
};
