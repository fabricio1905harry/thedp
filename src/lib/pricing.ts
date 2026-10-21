/**
 * TS mirror of tdp_compute_price() (migration 0035) — used only for the
 * live preview in Admin → Precificação. The database is the source of truth.
 */
export interface FixedCost {
  label: string;
  amount: number;
}

export interface PricingRules {
  fixed_costs: FixedCost[];
  margin_pct: number;
  commission_pct: number;
  icms_pct: number;
  pis_cofins_pct: number;
  card_fee_pct: number;
  fx_mode: "manual" | "auto";
  usd_rate: number;
  eur_rate: number;
  rounding: "up_to_9" | "up_to_integer" | "none";
  intl_freight_pct: number;
  local_taxes_pct: number;
  retail_markup: number;
}

export interface ProductPricingOverrides {
  extraCost?: number | null;
  marginPct?: number | null;
  commissionPct?: number | null;
  adjustPct?: number | null;
}

export function priceRound(x: number, mode: PricingRules["rounding"]): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  if (mode === "up_to_9") return Math.ceil(x / 10) * 10 - 1;
  if (mode === "up_to_integer") return Math.ceil(x);
  return Math.round(x * 100) / 100;
}

export function fixedTotal(rules: PricingRules) {
  return rules.fixed_costs.reduce((s, c) => s + (Number(c.amount) || 0), 0);
}

export function computePrice(
  cost: number,
  rules: PricingRules,
  o: ProductPricingOverrides = {},
  rates: { usd: number; eur: number } = { usd: rules.usd_rate, eur: rules.eur_rate }
) {
  if (!(cost > 0)) return null;
  const fixed = fixedTotal(rules);
  let pct =
    ((o.marginPct ?? rules.margin_pct) + (o.commissionPct ?? rules.commission_pct) + rules.icms_pct + rules.pis_cofins_pct + rules.card_fee_pct) / 100;
  pct = Math.min(Math.max(pct, 0), 0.95);
  const total = cost + fixed + (o.extraCost ?? 0);
  const brl = (total / (1 - pct)) * (1 + (o.adjustPct ?? 0) / 100);
  const usd = rates.usd > 0 ? priceRound(brl / rates.usd, rules.rounding) : null;
  const eur = rates.eur > 0 ? priceRound(brl / rates.eur, rules.rounding) : null;
  const factor = (1 + (rules.intl_freight_pct + rules.local_taxes_pct) / 100) * rules.retail_markup;
  return {
    fixed,
    totalCost: Math.round(total * 100) / 100,
    pct,
    brl: Math.round(brl * 100) / 100,
    usd,
    eur,
    retailUsd: usd !== null ? Math.round(usd * factor * 100) / 100 : null,
    retailEur: eur !== null ? Math.round(eur * factor * 100) / 100 : null,
  };
}
