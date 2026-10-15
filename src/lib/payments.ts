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
