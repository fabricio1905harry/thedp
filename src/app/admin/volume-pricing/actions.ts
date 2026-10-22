"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";
import { marginAfterDiscount, targetMargin, type MarginRules } from "@/lib/volume-pricing";

export type ActionResult = { error?: string };

export interface TierInput {
  name: string;
  operation: string;
  category: string;
  minQty: number;
  maxQty: number | null;
  discountPct: number;
  active: boolean;
}

/**
 * Keeps the Action Center in step with the tiers: one VOLUME PRICE BELOW
 * TARGET MARGIN item per active tier whose discount pushes the margin under
 * the target (margin_target_pct setting, or the pricing rule's own margin
 * when unset). Only raised while Volume Pricing is ON; resolved otherwise.
 */
export async function syncVolumeAlerts() {
  const admin = createServiceRoleClient();
  const [{ data: setting }, { data: tiers }, { data: rules }, { data: target }] = await Promise.all([
    admin.from("app_settings").select("value").eq("key", "volume_pricing").maybeSingle(),
    admin.from("volume_pricing_tiers").select("id, name, active, discount_pct"),
    admin.from("pricing_rules").select("margin_pct, commission_pct, icms_pct, pis_cofins_pct, card_fee_pct").eq("id", 1).maybeSingle(),
    admin.from("app_settings").select("value").eq("key", "margin_target_pct").maybeSingle(),
  ]);
  if (!rules) return;
  const enabled = (setting?.value as { enabled?: boolean } | null)?.enabled === true;
  const marginRules: MarginRules = {
    margin_pct: Number(rules.margin_pct),
    commission_pct: Number(rules.commission_pct),
    icms_pct: Number(rules.icms_pct),
    pis_cofins_pct: Number(rules.pis_cofins_pct),
    card_fee_pct: Number(rules.card_fee_pct),
  };
  const goal = targetMargin(target?.value, marginRules);

  for (const tier of tiers ?? []) {
    const dedupe = `volume_price_below_margin:${tier.id}`;
    const margin = marginAfterDiscount(Number(tier.discount_pct), marginRules);
    if (enabled && tier.active && margin < goal) {
      await admin.rpc("raise_action", {
        p_type: "volume_price_below_margin",
        p_dedupe: dedupe,
        p_title: `Volume tier "${tier.name}": ${Number(tier.discount_pct)}% off → margin ${margin}% (target ${goal}%)`,
        p_reference_type: "volume_tier",
        p_reference_id: tier.id,
        p_reference_label: tier.name,
        p_href: "/admin/volume-pricing",
        p_metadata: { discount_pct: Number(tier.discount_pct), margin_pct: margin, target_pct: goal },
      });
    } else {
      await admin.rpc("resolve_action", { p_dedupe: dedupe });
    }
  }
}

async function run(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    const staff = await getCurrentStaff();
    if (!staff) throw new Error("Não autorizado");
    await fn();
    await syncVolumeAlerts().catch((err) => console.error("[volume-pricing] alerts", err));
    revalidatePath("/admin/volume-pricing");
    revalidatePath("/admin/acoes");
    return {};
  } catch (err) {
    console.error("[admin/volume-pricing]", err);
    return { error: err instanceof Error ? err.message : "Falha na ação." };
  }
}

export async function setVolumePricingEnabled(enabled: boolean): Promise<ActionResult> {
  return run(async () => {
    const staff = await getCurrentStaff();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("app_settings")
      .upsert({ key: "volume_pricing", value: { enabled }, updated_at: new Date().toISOString(), updated_by: staff?.id })
      .select("key");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("Configuração não salva (sem permissão?).");
  });
}

export async function createTier(input: TierInput): Promise<ActionResult> {
  return run(async () => {
    const staff = await getCurrentStaff();
    const name = input.name.trim();
    if (!name) throw new Error("Dê um nome para a faixa.");
    if (!Number.isInteger(input.minQty) || input.minQty < 1) throw new Error("A quantidade mínima deve ser um inteiro a partir de 1.");
    if (input.maxQty !== null && (!Number.isInteger(input.maxQty) || input.maxQty < input.minQty)) {
      throw new Error("A quantidade máxima deve ser um inteiro maior ou igual à mínima (ou vazia = sem limite).");
    }
    if (!(input.discountPct > 0 && input.discountPct <= 90)) throw new Error("O desconto deve estar entre 0 e 90%.");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("volume_pricing_tiers")
      .insert({
        name,
        operation: input.operation || null,
        category: input.category.trim() || null,
        min_qty: input.minQty,
        max_qty: input.maxQty,
        discount_pct: input.discountPct,
        active: input.active,
        updated_by: staff?.id,
      })
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("A faixa não foi salva (sem permissão?).");
  });
}

export async function setTierActive(id: string, active: boolean): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("volume_pricing_tiers")
      .update({ active, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("Faixa não encontrada ou sem permissão.");
  });
}

export async function deleteTier(id: string): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.from("volume_pricing_tiers").delete().eq("id", id).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("Faixa não encontrada ou sem permissão.");
    await createServiceRoleClient().rpc("resolve_action", { p_dedupe: `volume_price_below_margin:${id}` });
  });
}
