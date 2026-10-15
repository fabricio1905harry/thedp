/**
 * Payment rules shared by the Admin and the buyer flow. The database is
 * the source of truth (available_payment_methods() and the payments
 * trigger in migration 0025); these helpers mirror it for previews.
 */

export type PaymentMethodCode = "bank_transfer" | "stripe_card" | "pix" | (string & {});
export type RuleScope = "channel" | "customer" | "order";

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  stripe_card: "Card / Stripe",
  pix: "Pix",
};

export const CHANNEL_LABELS: Record<string, string> = {
  intl_b2b: "International B2B",
  intl_b2c: "International B2C",
  br_b2b: "Brazil B2B",
  br_b2c: "Brazil B2C",
};

export interface PaymentRule {
  scope: RuleScope;
  method_code: string;
  enabled: boolean;
}

/** Channel default → customer exception → order exception; most specific wins. */
export function resolvePaymentAvailability(
  methods: string[],
  rules: PaymentRule[]
): Record<string, { enabled: boolean; decidedBy: RuleScope | "none" }> {
  const order: RuleScope[] = ["order", "customer", "channel"];
  return Object.fromEntries(
    methods.map((method) => {
      for (const scope of order) {
        const rule = rules.find((r) => r.scope === scope && r.method_code === method);
        if (rule) return [method, { enabled: rule.enabled, decidedBy: scope }];
      }
      return [method, { enabled: false, decidedBy: "none" as const }];
    })
  );
}

/**
 * Bank Processing Fee for ONE Bank Transfer payment. Configured in BRL,
 * converted with BRL-per-unit rate of the order currency.
 */
export function bankFeeInCurrency(feeBrl: number, brlPerUnit: number | null, currency: string): number {
  if (feeBrl <= 0) return 0;
  if (currency.toUpperCase() === "BRL") return round2(feeBrl);
  if (!brlPerUnit || brlPerUnit <= 0) throw new Error(`No FX rate to convert the bank fee to ${currency}`);
  return round2(feeBrl / brlPerUnit);
}

/**
 * Reserve for Later Delivery: product cost + configurable % (default 10%),
 * expressed back as the equivalent % of the sale value.
 *   costTotal and saleTotal must be in the same currency.
 */
export function computeReserve(costTotal: number, saleTotal: number, markupPct: number) {
  const amount = round2(costTotal * (1 + markupPct / 100));
  const pctOfSale = saleTotal > 0 ? Math.round((amount / saleTotal) * 10000) / 100 : 0;
  return { amount: Math.min(amount, round2(saleTotal)), pctOfSale: Math.min(pctOfSale, 100) };
}

/** Pass-through components that are collected but are NOT revenue. */
export const PASS_THROUGH_COMPONENTS = [
  { key: "freight_amount", label: "Freight Collected" },
  { key: "insurance_amount", label: "Insurance Collected" },
  { key: "fuel_surcharge_amount", label: "Fuel Surcharge Collected" },
  { key: "demand_surcharge_amount", label: "Demand Surcharge Collected" },
  { key: "export_declaration_amount", label: "Export Declaration Collected" },
  { key: "other_dhl_amount", label: "Other DHL Charges Collected" },
  { key: "duties_taxes_amount", label: "Duties & Taxes Collected / Prepaid" },
  { key: "bank_fee_amount", label: "Bank Processing Fees Collected" },
  { key: "other_charges_amount", label: "Other Operational Charges Collected" },
] as const;

export type PassThroughKey = (typeof PASS_THROUGH_COMPONENTS)[number]["key"];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------
// Amount due (buyer-facing payment / Stripe)
// ---------------------------------------------------------------------

export const ORDER_CHARGE_COLUMNS = [
  "freight_amount",
  "insurance_amount",
  "fuel_surcharge_amount",
  "demand_surcharge_amount",
  "export_declaration_amount",
  "other_dhl_amount",
  "duties_taxes_amount",
  "other_charges_amount",
] as const;

export type OrderChargeColumn = (typeof ORDER_CHARGE_COLUMNS)[number];

export interface AmountDue {
  kind: "full" | "reserve_deposit" | "balance";
  currency: string;
  merchandise: number;
  charges: Record<OrderChargeColumn, number>;
  total: number;
}

interface DueOrder {
  currency: string;
  subtotal: number | string;
  payment_mode: string;
  reserve_amount: number | string | null;
  [column: string]: unknown;
}

interface DuePayment {
  status: string;
  kind: string;
  merchandise_amount: number | string;
  [column: string]: unknown;
}

/**
 * What the buyer still owes right now, from the order and its CONFIRMED
 * payments:
 *  - Reserve order, deposit not paid yet → the reserve amount (merchandise only)
 *  - otherwise → the unpaid merchandise plus the freight/duties components
 *    not collected by earlier payments (kind balance after a deposit, else full).
 * Returns null when nothing is due.
 */
export function computeAmountDue(order: DueOrder, payments: DuePayment[]): AmountDue | null {
  const confirmed = payments.filter((p) => p.status === "confirmed");
  const paidMerchandise = confirmed.reduce((s, p) => s + Number(p.merchandise_amount), 0);
  const depositPaid = confirmed.some((p) => p.kind === "reserve_deposit");
  const zero = Object.fromEntries(ORDER_CHARGE_COLUMNS.map((c) => [c, 0])) as Record<OrderChargeColumn, number>;
  const subtotal = round2(Number(order.subtotal));

  if (order.payment_mode === "reserve" && !depositPaid) {
    const merchandise = round2(Math.min(Number(order.reserve_amount ?? 0), subtotal));
    if (merchandise <= 0) return null;
    return { kind: "reserve_deposit", currency: order.currency, merchandise, charges: zero, total: merchandise };
  }

  const merchandise = round2(Math.max(0, subtotal - paidMerchandise));
  const charges = { ...zero };
  for (const column of ORDER_CHARGE_COLUMNS) {
    const collected = confirmed.reduce((s, p) => s + Number(p[column] ?? 0), 0);
    charges[column] = round2(Math.max(0, Number(order[column] ?? 0) - collected));
  }
  const total = round2(merchandise + Object.values(charges).reduce((s, v) => s + v, 0));
  if (total <= 0) return null;
  return { kind: depositPaid ? "balance" : "full", currency: order.currency, merchandise, charges, total };
}
