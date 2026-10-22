"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";
import { DUTIES_MODES, REGIONS, type DutiesMode } from "@/lib/duties";

export type ActionResult = { error?: string };

export interface DutiesRuleInput {
  marketType: "country" | "region" | "default";
  /** ISO-2 country code or region key (ignored for the default rule) */
  market: string;
  mode: DutiesMode;
  defaultPct: number | null;
  note: string;
  active: boolean;
}

async function run(fn: (staffId: string) => Promise<void>): Promise<ActionResult> {
  try {
    const staff = await getCurrentStaff();
    if (!staff) throw new Error("Não autorizado");
    await fn(staff.id);
    revalidatePath("/admin/impostos");
    return {};
  } catch (err) {
    console.error("[admin/impostos]", err);
    return { error: err instanceof Error ? err.message : "Falha na ação." };
  }
}

/** Creates or replaces the rule of a market (one rule per market). */
export async function saveDutiesRule(input: DutiesRuleInput): Promise<ActionResult> {
  return run(async (staffId) => {
    if (!DUTIES_MODES.includes(input.mode)) throw new Error("Modo inválido.");
    let market = input.marketType === "default" ? "*" : input.market.trim();
    if (input.marketType === "country") {
      market = market.toUpperCase();
      if (!/^[A-Z]{2}$/.test(market)) throw new Error("Informe o país com o código de 2 letras (ex.: US, PT, ES).");
    }
    if (input.marketType === "region" && !REGIONS[market]) throw new Error("Região inválida.");
    if (input.defaultPct !== null && !(input.defaultPct >= 0 && input.defaultPct <= 100)) {
      throw new Error("O percentual padrão deve estar entre 0 e 100.");
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("duties_taxes_rules")
      .upsert(
        {
          market_type: input.marketType,
          market,
          mode: input.mode,
          default_pct: input.defaultPct,
          note: input.note.trim() || null,
          active: input.active,
          updated_at: new Date().toISOString(),
          updated_by: staffId,
        },
        { onConflict: "market_type,market" }
      )
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("A regra não foi salva (sem permissão?).");
  });
}

export async function setDutiesRuleActive(id: string, active: boolean): Promise<ActionResult> {
  return run(async (staffId) => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("duties_taxes_rules")
      .update({ active, updated_at: new Date().toISOString(), updated_by: staffId })
      .eq("id", id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("Regra não encontrada ou sem permissão.");
  });
}

export async function deleteDutiesRule(id: string): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.from("duties_taxes_rules").delete().eq("id", id).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("Regra não encontrada ou sem permissão.");
  });
}
