"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { guardStaff } from "@/lib/admin-guard";

type Result = { error?: string; ok?: boolean };

export interface SizeRowInput {
  id?: string;
  size_br: string;
  size_us: string;
  size_eu: string;
  letter: string;
  aliases: string;
  bust_cm: string;
  waist_cm: string;
  hip_cm: string;
  note_en: string;
  note_es: string;
  note_pt: string;
  sort: number;
  active: boolean;
}

export async function saveSizeRow(input: SizeRowInput): Promise<Result> {
  const g = await guardStaff();
  if (!g.staff) return { error: g.error };
  const br = input.size_br.trim();
  if (!br) return { error: "Informe o tamanho BR." };
  const clean = (v: string) => v.trim() || null;
  const row = {
    size_br: br,
    size_us: clean(input.size_us),
    size_eu: clean(input.size_eu),
    letter: clean(input.letter),
    aliases: input.aliases.split(",").map((a) => a.trim()).filter(Boolean),
    bust_cm: clean(input.bust_cm),
    waist_cm: clean(input.waist_cm),
    hip_cm: clean(input.hip_cm),
    note_en: clean(input.note_en),
    note_es: clean(input.note_es),
    note_pt: clean(input.note_pt),
    sort: Number.isFinite(input.sort) ? input.sort : 0,
    active: input.active,
    updated_at: new Date().toISOString(),
  };
  const supabase = await createClient();
  if (input.id) {
    const { data, error } = await supabase.from("size_chart").update(row).eq("id", input.id).select("id");
    if (error) return { error: error.code === "23505" ? "Já existe uma linha com esse tamanho BR." : error.message };
    if (!data || data.length === 0) return { error: "Linha não encontrada (nenhuma linha alterada)." };
  } else {
    const { error } = await supabase.from("size_chart").insert(row);
    if (error) return { error: error.code === "23505" ? "Já existe uma linha com esse tamanho BR." : error.message };
  }
  revalidatePath("/admin/tamanhos");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteSizeRow(id: string): Promise<Result> {
  const g = await guardStaff();
  if (!g.staff) return { error: g.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("size_chart").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Linha não encontrada." };
  revalidatePath("/admin/tamanhos");
  revalidatePath("/", "layout");
  return { ok: true };
}
