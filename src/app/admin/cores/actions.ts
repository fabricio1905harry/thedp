"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { guardStaff } from "@/lib/admin-guard";

type Result = { error?: string; ok?: boolean };

function refresh() {
  revalidatePath("/admin/cores");
  revalidatePath("/", "layout");
}

/** Maps a supplier color to a TDP color (empty = unmapped). `approve` marks it as reviewed. */
export async function saveColorMapping(supplierKey: string, tdpColorId: string, approve: boolean): Promise<Result> {
  const g = await guardStaff();
  if (!g.staff) return { error: g.error };
  const supabase = await createClient();
  const mapped = tdpColorId.trim() || null;
  const { data, error } = await supabase
    .from("supplier_color_map")
    .update({
      tdp_color_id: mapped,
      status: approve && mapped ? "approved" : "needs_review",
      manual_override: true,
      reviewed_at: new Date().toISOString(),
      reviewed_by: g.staff.id,
      updated_at: new Date().toISOString(),
    })
    .eq("supplier_key", supplierKey)
    .select("supplier_key");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Cor não encontrada (nenhuma linha alterada)." };
  await supabase.rpc("refresh_color_review_action");
  refresh();
  return { ok: true };
}

export interface TdpColorInput {
  id: string;
  name_en: string;
  name_es: string;
  name_pt: string;
  hex: string;
  active: boolean;
  isNew: boolean;
}

export async function saveTdpColor(input: TdpColorInput): Promise<Result> {
  const g = await guardStaff();
  if (!g.staff) return { error: g.error };
  const id = input.id.trim().toUpperCase();
  if (!id) return { error: "Informe o código da cor (ex.: EMERALD)." };
  if (!input.name_en.trim() || !input.name_es.trim() || !input.name_pt.trim()) {
    return { error: "Preencha os nomes em EN, ES e PT." };
  }
  if (input.hex && !/^#[0-9a-fA-F]{6}$/.test(input.hex.trim())) return { error: "Cor hex inválida (use #RRGGBB)." };
  const supabase = await createClient();
  const row = {
    name_en: input.name_en.trim(),
    name_es: input.name_es.trim(),
    name_pt: input.name_pt.trim(),
    hex: input.hex.trim() || null,
    active: input.active,
    updated_at: new Date().toISOString(),
  };
  if (input.isNew) {
    const { error } = await supabase.from("tdp_colors").insert({ id, ...row, sort: 1000 });
    if (error) return { error: error.code === "23505" ? "Já existe uma cor com esse código." : error.message };
  } else {
    const { data, error } = await supabase.from("tdp_colors").update(row).eq("id", id).select("id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "Cor não encontrada (nenhuma linha alterada)." };
  }
  refresh();
  return { ok: true };
}
