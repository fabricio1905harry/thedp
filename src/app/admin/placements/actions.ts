"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";

const TABLES = ["brands", "collections", "lookbooks", "tdp_edits"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (base: string, days: number) => {
  const d = new Date(`${base}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
};

export type PlacementAction = "renew" | "extend" | "end";

/**
 * Renew (new period from today), Extend (push the end date) or End (paid highlight off) a paid
 * placement. None of them touches the item itself: brands, collections, lookbooks, edits and
 * their products stay on the site.
 */
export async function placementAction(table: string, id: string, action: PlacementAction, days = 30): Promise<{ error?: string }> {
  try {
    const staff = await getCurrentStaff();
    if (!staff) return { error: "Não autorizado." };
    if (!TABLES.includes(table)) return { error: "Tipo inválido." };
    const span = Math.min(Math.max(Math.round(Number(days) || 30), 1), 730);
    const supabase = await createClient();
    const { data: row, error: readError } = await supabase.from(table).select("id, placement_start, placement_end").eq("id", id).maybeSingle();
    if (readError || !row) return { error: readError?.message ?? "Item não encontrado." };

    const today = iso(new Date());
    let patch: Record<string, unknown>;
    if (action === "renew") {
      patch = { paid_placement: true, placement_start: today, placement_end: addDays(today, span) };
    } else if (action === "extend") {
      const base = row.placement_end && row.placement_end >= today ? (row.placement_end as string) : today;
      patch = { paid_placement: true, placement_end: addDays(base, span) };
    } else {
      patch = { paid_placement: false, featured: false, placement_end: today };
    }
    const { data, error } = await supabase.from(table).update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "Nenhuma linha alterada." };
    await supabase.rpc("refresh_placement_actions");
    revalidatePath("/admin/placements");
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao salvar." };
  }
}
