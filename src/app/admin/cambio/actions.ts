"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";
import type { FxQuote } from "@/lib/fx";

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
  if (!staff) return { status: "error", message: "Not authorized" };

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
