"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";

export type ActionResult = { error?: string; info?: string };

export async function saveAbandonedCartSettings(input: { enabled: boolean; hours1: number; hours2: number }): Promise<ActionResult> {
  try {
    const staff = await getCurrentStaff();
    if (!staff) return { error: "Não autorizado" };
    const { enabled, hours1, hours2 } = input;
    if (![hours1, hours2].every((h) => Number.isFinite(h) && h > 0 && h <= 720)) return { error: "Informe horas entre 1 e 720." };
    if (hours2 <= hours1) return { error: "O e-mail 2 precisa vir depois do e-mail 1." };
    const supabase = await createClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("app_settings")
      .upsert(
        [
          { key: "abandoned_cart_enabled", value: enabled, updated_at: now, updated_by: staff.id },
          { key: "abandoned_cart_hours_1", value: hours1, updated_at: now, updated_by: staff.id },
          { key: "abandoned_cart_hours_2", value: hours2, updated_at: now, updated_by: staff.id },
        ],
        { onConflict: "key" }
      )
      .select("key");
    if (error) return { error: error.message };
    if (!data || data.length < 3) return { error: "Nada foi salvo (sem permissão?)." };
    revalidatePath("/admin/carrinhos");
    return { info: "Configuração salva." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao salvar." };
  }
}
