/**
 * Minimum order rules (migration 0061). Pure evaluation shared by the cart
 * (via a server action) and the checkout server action.
 *
 * A rule only applies when the cart holds something it targets: a category
 * rule is ignored for a cart without that category. Launch default: no
 * active rule → nothing is ever blocked.
 */
export type MinScope = "operation" | "category" | "brand" | "product";
export type Locale3 = "en" | "es" | "pt";

export interface MinimumRule {
  id: string;
  name: string;
  operation: string | null;
  scope: MinScope;
  scope_value: string | null;
  min_type: "amount" | "units";
  min_value: number;
  currency: string;
  active: boolean;
  labels: Partial<Record<Locale3, string>>;
  message: Partial<Record<Locale3, string>>;
}

export interface MinLine {
  productId: string | null;
  productTitle?: string | null;
  category: string | null;
  brand: string | null;
  qty: number;
  /** line total in the cart currency */
  amount: number;
}

export interface Shortfall {
  ruleId: string;
  scope: MinScope;
  minType: "amount" | "units";
  /** units missing, or amount missing in the cart currency */
  missing: number;
  /** the minimum itself (units or amount in the cart currency) */
  minimum: number;
  currency: string;
  /** what the buyer must add more of (category/brand/product name); null = the whole order */
  label: string | null;
  labels: Partial<Record<Locale3, string>>;
  message: Partial<Record<Locale3, string>>;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function matches(rule: MinimumRule, line: MinLine): boolean {
  switch (rule.scope) {
    case "operation":
      return true;
    case "category":
      return norm(line.category) === norm(rule.scope_value);
    case "brand":
      return norm(line.brand) === norm(rule.scope_value);
    case "product":
      return line.productId !== null && line.productId === rule.scope_value;
  }
}

export function evaluateMinimums(
  rules: MinimumRule[],
  lines: MinLine[],
  ctx: {
    operation: string | null;
    currency: string;
    /** BRL per 1 unit of the currency (1 for BRL); null when unknown */
    brlPerUnit: (currency: string) => number | null;
  }
): Shortfall[] {
  const out: Shortfall[] = [];
  for (const rule of rules) {
    if (!rule.active) continue;
    if (rule.operation && ctx.operation && rule.operation !== ctx.operation) continue;
    if (rule.operation && !ctx.operation) continue;

    const scoped = lines.filter((l) => l.qty > 0 && matches(rule, l));
    if (scoped.length === 0) continue;

    let have: number;
    let minimum: number;
    if (rule.min_type === "units") {
      have = scoped.reduce((s, l) => s + l.qty, 0);
      minimum = Number(rule.min_value);
    } else {
      have = scoped.reduce((s, l) => s + l.amount, 0);
      const from = ctx.brlPerUnit(rule.currency);
      const to = ctx.brlPerUnit(ctx.currency);
      minimum =
        rule.currency === ctx.currency
          ? Number(rule.min_value)
          : from && to
            ? Math.ceil(((Number(rule.min_value) * from) / to) * 100) / 100
            : Number(rule.min_value); // unknown FX: compare as-is rather than silently disabling the rule
    }
    if (have + 1e-9 >= minimum) continue;

    const missing = rule.min_type === "units" ? Math.ceil(minimum - have) : Math.ceil((minimum - have) * 100) / 100;
    out.push({
      ruleId: rule.id,
      scope: rule.scope,
      minType: rule.min_type,
      missing,
      minimum,
      currency: rule.min_type === "amount" ? ctx.currency : "",
      label:
        rule.scope === "operation"
          ? null
          : rule.scope === "product"
            ? (scoped[0]?.productTitle ?? rule.name)
            : rule.scope_value,
      labels: rule.labels ?? {},
      message: rule.message ?? {},
    });
  }
  return out;
}
