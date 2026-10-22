import { createServiceRoleClient } from "@/lib/supabase/server";
import { evaluateMinimums, type MinimumRule, type MinLine, type Shortfall } from "@/lib/order-minimums";
import { applyVolumePricing, type VolumeTier } from "@/lib/volume-pricing";

export interface CartLineInput {
  variantId: string;
  qty: number;
  /** unit price in `currency` as shown to the buyer */
  price: number;
}

export interface CartCommercialStatus {
  operation: string | null;
  shortfalls: Shortfall[];
  volume: {
    enabled: boolean;
    /** unit price after the volume discount, per variant (only lines with a discount) */
    lines: { variantId: string; pct: number; unitPrice: number }[];
    discountTotal: number;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Server-side evaluation of the commercial rules for a cart: minimum order
 * rules and Volume Pricing. Single source of truth for the cart page (via a
 * server action) and the checkout action. If the tables are missing (migration
 * 0061 not applied yet) or unreachable, nothing is blocked and no discount is
 * applied — the rules are OFF at launch anyway.
 */
export async function evaluateCart(
  customerId: string | null,
  lines: CartLineInput[],
  currency: string
): Promise<CartCommercialStatus> {
  const empty: CartCommercialStatus = {
    operation: null,
    shortfalls: [],
    volume: { enabled: false, lines: [], discountTotal: 0 },
  };
  const clean = lines.filter((l) => l.qty > 0 && Number.isFinite(l.price));
  if (clean.length === 0) return empty;

  try {
    const supabase = createServiceRoleClient();

    const [{ data: customer }, { data: rules }, { data: volumeSetting }, { data: tiers }, { data: variants }] = await Promise.all([
      customerId
        ? supabase.from("customers").select("channel").eq("id", customerId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("order_minimum_rules").select("*").eq("active", true),
      supabase.from("app_settings").select("value").eq("key", "volume_pricing").maybeSingle(),
      supabase.from("volume_pricing_tiers").select("*").eq("active", true),
      supabase
        .from("variants")
        .select("id, product_id, products ( id, title, category, brand )")
        .in("id", clean.map((l) => l.variantId)),
    ]);

    const operation = (customer as { channel?: string | null } | null)?.channel ?? null;

    type ProductRow = { id: string; title: string | null; category: string | null; brand: string | null };
    const info = new Map<string, ProductRow>();
    for (const v of (variants ?? []) as unknown as { id: string; products: ProductRow | ProductRow[] | null }[]) {
      const p = Array.isArray(v.products) ? v.products[0] : v.products;
      if (p) info.set(v.id, p);
    }

    // volume pricing first: minimum AMOUNT rules are checked on what the buyer will pay
    const volumeEnabled = (volumeSetting?.value as { enabled?: boolean } | null)?.enabled === true;
    const volumeLines: CartCommercialStatus["volume"]["lines"] = [];
    const priceOf = new Map<string, number>(clean.map((l) => [l.variantId, l.price]));
    let discountTotal = 0;
    if (volumeEnabled && (tiers ?? []).length > 0) {
      const results = applyVolumePricing(
        (tiers ?? []).map((t) => ({ ...t, discount_pct: Number(t.discount_pct) })) as VolumeTier[],
        clean.map((l) => ({ key: l.variantId, category: info.get(l.variantId)?.category ?? null, qty: l.qty })),
        operation
      );
      for (const r of results) {
        if (r.pct <= 0) continue;
        const line = clean.find((l) => l.variantId === r.key)!;
        const unitPrice = round2(line.price * (1 - r.pct / 100));
        priceOf.set(r.key, unitPrice);
        discountTotal += round2((line.price - unitPrice) * line.qty);
        volumeLines.push({ variantId: r.key, pct: r.pct, unitPrice });
      }
    }

    const minLines: MinLine[] = clean.map((l) => {
      const p = info.get(l.variantId);
      return {
        productId: p?.id ?? null,
        productTitle: p?.title ?? null,
        category: p?.category ?? null,
        brand: p?.brand ?? null,
        qty: l.qty,
        amount: round2((priceOf.get(l.variantId) ?? l.price) * l.qty),
      };
    });

    let shortfalls: Shortfall[] = [];
    if ((rules ?? []).length > 0) {
      const needed = new Set<string>([currency, ...(rules ?? []).map((r) => String(r.currency))]);
      const rates = new Map<string, number | null>();
      await Promise.all(
        [...needed].map(async (cur) => {
          if (cur === "BRL") return void rates.set(cur, 1);
          const { data } = await supabase.rpc("latest_brl_rate", { cur });
          rates.set(cur, data ? Number(data) : null);
        })
      );
      shortfalls = evaluateMinimums(
        (rules ?? []).map((r) => ({ ...r, min_value: Number(r.min_value) })) as MinimumRule[],
        minLines,
        { operation, currency, brlPerUnit: (c) => rates.get(c) ?? null }
      );
    }

    return {
      operation,
      shortfalls,
      volume: { enabled: volumeEnabled, lines: volumeLines, discountTotal: round2(discountTotal) },
    };
  } catch (err) {
    console.error("[commercial] evaluateCart", err);
    return empty;
  }
}
