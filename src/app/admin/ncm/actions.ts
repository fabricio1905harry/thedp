"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { guardStaff } from "@/lib/admin-guard";

type Result = { error?: string; ok?: boolean; count?: number };

export interface Dims {
  length: string;
  width: string;
  height: string;
}

function dimsOf(d: Dims): { length: number; width: number; height: number } | null {
  const l = Number(d.length);
  const w = Number(d.width);
  const h = Number(d.height);
  if (!(l > 0) || !(w > 0) || !(h > 0)) return null;
  return { length: l, width: w, height: h };
}
const weightOf = (v: string) => {
  const n = Math.round(Number(v));
  return n > 0 ? n : null;
};
const refresh = () => {
  revalidatePath("/admin/ncm");
  revalidatePath("/admin/acoes");
};

export interface HsInput {
  code: string;
  description: string;
  weight: string;
  dims: Dims;
  country: string;
  validated: boolean;
  active: boolean;
  notes: string;
  isNew: boolean;
}

export async function saveHsCode(i: HsInput): Promise<Result> {
  const g = await guardStaff();
  if (!g.staff) return { error: g.error };
  const code = i.code.trim();
  if (!code) return { error: "Informe o código NCM/HS." };
  if (!i.description.trim()) return { error: "Informe a descrição." };
  const hasDims = i.dims.length || i.dims.width || i.dims.height;
  if (hasDims && !dimsOf(i.dims)) return { error: "Dimensões: preencha comprimento, largura e altura (maiores que zero) ou deixe todas vazias." };
  const row = {
    description: i.description.trim(),
    default_weight_g: weightOf(i.weight),
    default_dims_cm: hasDims ? dimsOf(i.dims) : null,
    country_origin: i.country.trim().toUpperCase() || "BR",
    validated: i.validated,
    active: i.active,
    notes: i.notes.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const supabase = await createClient();
  if (i.isNew) {
    const { error } = await supabase.from("hs_codes_master").insert({ code, ...row });
    if (error) return { error: error.code === "23505" ? "Esse código já existe." : error.message };
  } else {
    const { data, error } = await supabase.from("hs_codes_master").update(row).eq("code", code).select("code");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "Código não encontrado (nenhuma linha alterada)." };
  }
  refresh();
  return { ok: true };
}

export interface CategoryInput {
  category: string;
  hs_code: string;
  weight: string;
  dims: Dims;
}

export async function saveCategoryDefault(i: CategoryInput): Promise<Result> {
  const g = await guardStaff();
  if (!g.staff) return { error: g.error };
  const category = i.category.trim();
  if (!category) return { error: "Informe a categoria." };
  const hasDims = i.dims.length || i.dims.width || i.dims.height;
  if (hasDims && !dimsOf(i.dims)) return { error: "Dimensões: preencha comprimento, largura e altura ou deixe todas vazias." };
  const supabase = await createClient();
  const { error } = await supabase.from("category_shipping_defaults").upsert(
    {
      category,
      hs_code: i.hs_code || null,
      weight_g: weightOf(i.weight),
      dims_cm: hasDims ? dimsOf(i.dims) : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "category" }
  );
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

export async function deleteCategoryDefault(category: string): Promise<Result> {
  const g = await guardStaff();
  if (!g.staff) return { error: g.error };
  const supabase = await createClient();
  const { error } = await supabase.from("category_shipping_defaults").delete().eq("category", category);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

/** Applies the category defaults to products still missing HS code / weight / dimensions. */
export async function applyCategoryDefaults(): Promise<Result> {
  const g = await guardStaff();
  if (!g.staff) return { error: g.error };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_category_shipping_defaults");
  if (error) return { error: error.message };
  refresh();
  return { ok: true, count: Number(data) || 0 };
}

export interface ReviewInput {
  productId: string;
  hs_code: string;
  weight: string;
  dims: Dims;
  /** also store these values as the rule of the product's category + composition */
  saveAsRule?: boolean;
}

/** Approves a product's shipping data (optionally correcting the values): clears the review flag. */
export async function approveProductShipping(i: ReviewInput): Promise<Result> {
  const g = await guardStaff();
  if (!g.staff) return { error: g.error };
  const weight = weightOf(i.weight);
  const dims = dimsOf(i.dims);
  if (!i.hs_code.trim()) return { error: "Informe o código NCM/HS." };
  if (!weight) return { error: "Informe o peso em gramas." };
  if (!dims) return { error: "Informe comprimento, largura e altura." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({ hs_code: i.hs_code.trim(), weight_g: weight, dims_cm: dims, shipping_inherited: [] })
    .eq("id", i.productId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Produto não encontrado (nenhuma linha alterada)." };

  if (i.saveAsRule) {
    const { data: product } = await supabase.from("products").select("category, composition").eq("id", i.productId).maybeSingle();
    if (!product?.category || !product.composition) return { error: "Aprovado, mas a regra não foi salva: o produto precisa de categoria e composição." };
    const rule = await upsertRule({
      category: product.category,
      composition: product.composition,
      hs_code: i.hs_code.trim(),
      weight,
      dims,
    });
    if (rule.error) return { error: `Aprovado, mas a regra não foi salva: ${rule.error}` };
  }
  refresh();
  return { ok: true };
}

async function upsertRule(r: { category: string; composition: string; hs_code: string; weight: number | null; dims: { length: number; width: number; height: number } | null; notes?: string | null }) {
  const supabase = await createClient();
  const { data: keys, error: keyError } = await supabase.rpc("tdp_composition_key", { c: r.composition });
  const { data: catKey } = await supabase.rpc("tdp_category_key", { c: r.category });
  if (keyError || !keys || !catKey) return { error: keyError?.message ?? "Composição inválida (use por exemplo “95% viscose, 5% elastano”)." };
  const { error } = await supabase.from("hs_rules").upsert(
    {
      category: r.category.trim(),
      category_key: catKey as string,
      composition_label: r.composition.trim(),
      composition_key: keys as string,
      hs_code: r.hs_code || null,
      weight_g: r.weight,
      dims_cm: r.dims,
      notes: r.notes ?? null,
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "category_key,composition_key" }
  );
  return { error: error?.message };
}

export interface RuleInput {
  category: string;
  composition: string;
  hs_code: string;
  weight: string;
  dims: Dims;
  notes: string;
}

/** Rule by Category + normalized Composition (applies to new and existing products without own values). */
export async function saveHsRule(i: RuleInput): Promise<Result> {
  const g = await guardStaff();
  if (!g.staff) return { error: g.error };
  if (!i.category.trim() || !i.composition.trim()) return { error: "Informe a categoria e a composição." };
  if (!i.hs_code.trim()) return { error: "Escolha o NCM/HS da regra." };
  const hasDims = i.dims.length || i.dims.width || i.dims.height;
  if (hasDims && !dimsOf(i.dims)) return { error: "Dimensões: preencha comprimento, largura e altura ou deixe todas vazias." };
  const res = await upsertRule({
    category: i.category,
    composition: i.composition,
    hs_code: i.hs_code.trim(),
    weight: weightOf(i.weight),
    dims: hasDims ? dimsOf(i.dims) : null,
    notes: i.notes.trim() || null,
  });
  if (res.error) return { error: res.error };
  const supabase = await createClient();
  await supabase.rpc("apply_category_shipping_defaults");
  refresh();
  return { ok: true };
}

export async function deleteHsRule(id: string): Promise<Result> {
  const g = await guardStaff();
  if (!g.staff) return { error: g.error };
  const supabase = await createClient();
  const { error } = await supabase.from("hs_rules").delete().eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}
