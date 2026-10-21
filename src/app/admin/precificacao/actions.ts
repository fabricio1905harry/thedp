"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";
import type { PricingRules } from "@/lib/pricing";

async function requireStaff() {
  const staff = await getCurrentStaff();
  if (!staff) throw new Error("Não autorizado");
  return staff;
}

function refresh() {
  revalidatePath("/admin/precificacao");
  revalidatePath("/admin/produtos");
  revalidatePath("/", "layout");
}

const num = (v: unknown, min = 0, max = 1_000_000) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error("Valor inválido");
  return Math.min(Math.max(n, min), max);
};

/** Saving the rules recalculates every product (trigger pricing_rules_recompute). */
export async function savePricingRules(rules: PricingRules): Promise<{ error?: string; count?: number }> {
  try {
    const startedAt = new Date().toISOString();
    const staff = await requireStaff();
    const pctSum = num(rules.margin_pct) + num(rules.commission_pct) + num(rules.icms_pct) + num(rules.pis_cofins_pct) + num(rules.card_fee_pct);
    if (pctSum >= 95) return { error: "Margem + comissão + impostos precisam somar menos de 95%." };
    const supabase = await createClient();
    const { error } = await supabase
      .from("pricing_rules")
      .update({
        fixed_costs: rules.fixed_costs
          .map((c) => ({ label: String(c.label ?? "").trim().slice(0, 80), amount: num(c.amount, 0, 100_000) }))
          .filter((c) => c.label),
        margin_pct: num(rules.margin_pct, 0, 94),
        commission_pct: num(rules.commission_pct, 0, 94),
        icms_pct: num(rules.icms_pct, 0, 94),
        pis_cofins_pct: num(rules.pis_cofins_pct, 0, 94),
        card_fee_pct: num(rules.card_fee_pct, 0, 94),
        fx_mode: rules.fx_mode === "auto" ? "auto" : "manual",
        usd_rate: num(rules.usd_rate, 0.0001, 1000),
        eur_rate: num(rules.eur_rate, 0.0001, 1000),
        rounding: ["up_to_9", "up_to_integer", "none"].includes(rules.rounding) ? rules.rounding : "up_to_9",
        intl_freight_pct: num(rules.intl_freight_pct, 0, 500),
        local_taxes_pct: num(rules.local_taxes_pct, 0, 500),
        retail_markup: num(rules.retail_markup, 0, 100),
        updated_at: new Date().toISOString(),
        updated_by: staff.id,
      })
      .eq("id", 1);
    if (error) return { error: error.message };
    // The database recalculates every product when the rules change; count them for the confirmation.
    const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).gte("priced_at", startedAt);
    refresh();
    return { count: count ?? 0 };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao salvar" };
  }
}

export async function recomputeAllPrices(): Promise<{ error?: string; count?: number }> {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recompute_all_product_prices");
  if (error) return { error: error.message };
  refresh();
  return { count: Number(data ?? 0) };
}

export type BulkTarget = { mode: "selected"; ids: string[] } | { mode: "filter"; category?: string; status?: string; search?: string };

export type BulkAction =
  | { kind: "margin"; value: number | null }
  | { kind: "commission"; value: number | null }
  | { kind: "adjust"; value: number }
  | { kind: "extra_cost"; value: number }
  | { kind: "cost_pct"; value: number }
  | { kind: "reset" };

/** Mass price adjustment over selected products or everything matching a filter. */
export async function bulkAdjustPrices(target: BulkTarget, action: BulkAction): Promise<{ error?: string; count?: number }> {
  try {
    await requireStaff();
    const supabase = await createClient();

    let idQuery = supabase.from("products").select("id, original_price");
    if (target.mode === "selected") {
      if (target.ids.length === 0) return { error: "Selecione ao menos um produto." };
      idQuery = idQuery.in("id", target.ids.slice(0, 2000));
    } else {
      if (target.category) idQuery = idQuery.eq("category", target.category);
      if (target.status) idQuery = idQuery.eq("status", target.status);
      if (target.search) idQuery = idQuery.ilike("title", `%${target.search.replace(/[%_]/g, "")}%`);
    }
    const { data: rows, error: readError } = await idQuery.limit(5000);
    if (readError) return { error: readError.message };
    const ids = (rows ?? []).map((r) => r.id as string);
    if (ids.length === 0) return { error: "Nenhum produto encontrado com esse filtro." };

    let patch: Record<string, unknown>;
    switch (action.kind) {
      case "margin":
        patch = { margin_pct_override: action.value === null ? null : num(action.value, 0, 94) };
        break;
      case "commission":
        patch = { commission_pct_override: action.value === null ? null : num(action.value, 0, 94) };
        break;
      case "adjust":
        patch = { price_adjust_pct: num(action.value, -90, 500) };
        break;
      case "extra_cost":
        patch = { extra_cost_brl: num(action.value, 0, 100_000) };
        break;
      case "reset":
        patch = { margin_pct_override: null, commission_pct_override: null, price_adjust_pct: 0, extra_cost_brl: 0 };
        break;
      case "cost_pct": {
        // change the piece cost itself by a % (e.g. supplier raised prices 5%)
        const pct = num(action.value, -90, 500) / 100;
        for (const r of rows ?? []) {
          const cost = Number(r.original_price);
          if (!(cost > 0)) continue;
          const { error } = await supabase.from("products").update({ original_price: Math.round(cost * (1 + pct) * 100) / 100 }).eq("id", r.id);
          if (error) return { error: error.message };
        }
        refresh();
        return { count: ids.length };
      }
    }
    for (let i = 0; i < ids.length; i += 500) {
      const { error } = await supabase.from("products").update(patch).in("id", ids.slice(i, i + 500));
      if (error) return { error: error.message };
    }
    refresh();
    return { count: ids.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha no ajuste" };
  }
}

/** Per-product overrides (product page). Empty = follow the global rule. */
export async function setProductPricing(
  productId: string,
  input: { marginPct: number | null; commissionPct: number | null; adjustPct: number; extraCost: number }
): Promise<{ error?: string }> {
  try {
    await requireStaff();
    const supabase = await createClient();
    const { error } = await supabase
      .from("products")
      .update({
        margin_pct_override: input.marginPct === null ? null : num(input.marginPct, 0, 94),
        commission_pct_override: input.commissionPct === null ? null : num(input.commissionPct, 0, 94),
        price_adjust_pct: num(input.adjustPct, -90, 500),
        extra_cost_brl: num(input.extraCost, 0, 100_000),
      })
      .eq("id", productId);
    if (error) return { error: error.message };
    refresh();
    revalidatePath(`/admin/produtos/${productId}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao salvar" };
  }
}
