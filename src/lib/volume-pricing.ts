/**
 * Volume Pricing (migration 0061): quantity range → % discount, per
 * operation and optionally per category. OFF at launch (app_settings
 * volume_pricing.enabled). Pure helpers shared by the cart, the checkout
 * action and the Admin screen.
 */
export interface VolumeTier {
  id: string;
  name: string;
  operation: string | null;
  category: string | null;
  min_qty: number;
  max_qty: number | null;
  discount_pct: number;
  active: boolean;
}

export interface VolumeLine {
  key: string;
  category: string | null;
  qty: number;
}

export interface VolumeLineResult {
  key: string;
  pct: number;
  tierId: string | null;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function pickTier(candidates: VolumeTier[], qty: number): VolumeTier | null {
  const inRange = candidates.filter((t) => qty >= t.min_qty && (t.max_qty === null || qty <= t.max_qty));
  if (inRange.length === 0) return null;
  // most specific operation first, then the highest discount
  return inRange.sort(
    (a, b) => Number(Boolean(b.operation)) - Number(Boolean(a.operation)) || b.discount_pct - a.discount_pct
  )[0];
}

/**
 * Category tiers look at the quantity of that category in the cart; tiers
 * without a category look at the whole cart. A line gets the category tier
 * when there is one for its quantity, otherwise the whole-cart tier.
 */
export function applyVolumePricing(tiers: VolumeTier[], lines: VolumeLine[], operation: string | null): VolumeLineResult[] {
  const usable = tiers.filter((t) => t.active && (!t.operation || t.operation === operation));
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const general = pickTier(usable.filter((t) => !t.category), totalQty);
  return lines.map((line) => {
    const catQty = lines.filter((l) => norm(l.category) === norm(line.category)).reduce((s, l) => s + l.qty, 0);
    const specific = line.category
      ? pickTier(usable.filter((t) => t.category && norm(t.category) === norm(line.category)), catQty)
      : null;
    const tier = specific ?? general;
    return { key: line.key, pct: tier ? Number(tier.discount_pct) : 0, tierId: tier?.id ?? null };
  });
}

export interface MarginRules {
  margin_pct: number;
  commission_pct: number;
  icms_pct: number;
  pis_cofins_pct: number;
  card_fee_pct: number;
}

/**
 * Margin (% of the selling price) after a volume discount, from the pricing
 * engine's structure (migration 0035): price = cost / (1 − M − O) where M is
 * the margin and O the percentages over the price (commission, taxes, card).
 * Discounting the price by d leaves margin' = 1 − (1 − M − O)/(1 − d) − O.
 */
export function marginAfterDiscount(discountPct: number, rules: MarginRules): number {
  const m = rules.margin_pct / 100;
  const o = (rules.commission_pct + rules.icms_pct + rules.pis_cofins_pct + rules.card_fee_pct) / 100;
  const d = Math.min(Math.max(discountPct, 0), 99.99) / 100;
  const margin = 1 - (1 - m - o) / (1 - d) - o;
  return Math.round(margin * 10000) / 100;
}

/** Target margin: the `margin_target_pct` setting when set, otherwise the pricing rule's own margin. */
export function targetMargin(settingValue: unknown, rules: MarginRules): number {
  const v = typeof settingValue === "number" ? settingValue : Number(settingValue);
  return settingValue !== null && settingValue !== undefined && settingValue !== "" && Number.isFinite(v) ? v : rules.margin_pct;
}
