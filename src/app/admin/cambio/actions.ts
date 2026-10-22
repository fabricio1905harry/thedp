"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";
import type { FxQuote } from "@/lib/fx";
import { getFxSettings, updateFxRatesNow } from "@/lib/fx-auto";

export interface SetFxRateState {
  status: "idle" | "success" | "error";
  message?: string;
}

/**
 * Manual exchange rate entry — no external API. Validates rate > 0 (also
 * enforced by the fx_rates_staff_write RLS check as a second layer).
 */
export async function setFxRate(
  quote: FxQuote,
  _prevState: SetFxRateState,
  formData: FormData
): Promise<SetFxRateState> {
  const staff = await getCurrentStaff();
  if (!staff) return { status: "error", message: "Não autorizado" };

  const rate = Number(formData.get("rate"));
  if (!Number.isFinite(rate) || rate <= 0) {
    return { status: "error", message: "A cotação de câmbio deve ser um número positivo maior que zero." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("fx_rates").insert({
    base: "BRL",
    quote,
    rate,
    updated_by: staff.id,
  });

  if (error) return { status: "error", message: error.message };

  revalidatePath("/admin/cambio");
  return { status: "success" };
}

export async function setUsdRate(prevState: SetFxRateState, formData: FormData) {
  return setFxRate("USD", prevState, formData);
}

export async function setEurRate(prevState: SetFxRateState, formData: FormData) {
  return setFxRate("EUR", prevState, formData);
}

/** "UPDATE FX NOW" — same automatic fetch as the daily job, on demand. */
export async function updateFxNow(): Promise<SetFxRateState> {
  const staff = await getCurrentStaff();
  if (!staff) return { status: "error", message: "Não autorizado" };
  const result = await updateFxRatesNow("manual", staff.id);
  revalidatePath("/admin/cambio");
  return result.ok
    ? { status: "success", message: `USD ${result.rates.USD} · EUR ${result.rates.EUR}` }
    : { status: "error", message: result.error };
}

/** Source (BCE / PTAX) and frequency (daily / weekly) of the automatic update. */
export async function saveFxSettings(input: {
  enabled: boolean;
  source: "ecb" | "ptax";
  frequency: "daily" | "weekly";
}): Promise<{ error?: string }> {
  try {
    const staff = await getCurrentStaff();
    if (!staff) return { error: "Não autorizado" };
    if (!["ecb", "ptax"].includes(input.source) || !["daily", "weekly"].includes(input.frequency)) {
      return { error: "Valores inválidos." };
    }
    const current = await getFxSettings();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("app_settings")
      .upsert({
        key: "fx_auto",
        value: { ...current, enabled: input.enabled, source: input.source, frequency: input.frequency },
        updated_at: new Date().toISOString(),
        updated_by: staff.id,
      })
      .select("key");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "Configuração não salva (sem permissão?)." };
    revalidatePath("/admin/cambio");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao salvar." };
  }
}
