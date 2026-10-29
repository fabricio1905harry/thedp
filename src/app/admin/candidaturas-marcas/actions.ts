"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";

export const BRAND_STATUSES = ["new", "under_review", "contacted", "approved", "not_a_fit", "on_hold"] as const;
export type BrandStatus = (typeof BRAND_STATUSES)[number];

export async function updateBrandApplication(id: string, status: BrandStatus, notes: string): Promise<{ error?: string }> {
  try {
    const staff = await getCurrentStaff();
    if (!staff) return { error: "Não autorizado." };
    if (!BRAND_STATUSES.includes(status)) return { error: "Status inválido." };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("brand_applications")
      .update({ status, notes: notes.trim().slice(0, 4000) || null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "Candidatura não encontrada." };
    revalidatePath("/admin/candidaturas-marcas");
    revalidatePath("/admin");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao salvar." };
  }
}
