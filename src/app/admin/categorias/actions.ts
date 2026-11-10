"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { guardStaff } from "@/lib/admin-guard";

type Result = { error?: string; ok?: boolean; count?: number };

export interface CategoryInput {
  /** current name when editing ("" for a new category) */
  original: string;
  name: string;
  nameEn: string;
  nameEs: string;
  parent: string;
  ncm: string;
  hs: string;
  /** kg, "1,60" or "1.6" */
  weightKg: string;
  length: string;
  width: string;
  height: string;
  active: boolean;
  sort: string;
}

const num = (v: string) => Number(String(v ?? "").replace(",", ".").trim());

function refresh() {
  revalidatePath("/admin/categorias");
  revalidatePath("/admin/ncm");
  revalidatePath("/admin/produtos");
}

/**
 * Creates / edits a category (P18). Its NCM, HS, weight and dimensions go automatically to the products of the
 * category (and of its subcategories): values a product received from the category are replaced, values typed on
 * the product itself are kept. Renaming also renames the category on its products.
 */
export async function saveCategory(i: CategoryInput): Promise<Result> {
  const g = await guardStaff();
  if (!g.staff) return { error: g.error };
  const name = i.name.trim().slice(0, 80);
  if (!name) return { error: "Informe o nome da categoria." };
  const parent = i.parent.trim();
  if (parent && parent === name) return { error: "A categoria não pode ser subcategoria dela mesma." };
  const ncm = i.ncm.replace(/\D/g, "");
  if (ncm && ncm.length !== 8) return { error: "O NCM tem 8 dígitos." };
  const hs = i.hs.replace(/\D/g, "");
  if (hs && hs.length !== 6) return { error: "O HS tem 6 dígitos (deixe vazio para usar os 6 primeiros do NCM)." };
  const w = i.weightKg.trim() ? num(i.weightKg) : null;
  if (w !== null && !(w > 0)) return { error: "Peso: informe um valor em kg maior que zero (ex.: 1,60)." };
  const dims = [num(i.length), num(i.width), num(i.height)];
  const anyDim = [i.length, i.width, i.height].some((v) => String(v ?? "").trim() !== "");
  if (anyDim && dims.some((d) => !(d > 0))) return { error: "Medidas: preencha comprimento, largura e altura (cm) ou deixe as três vazias." };

  const supabase = await createClient();
  if (parent) {
    const { data: p } = await supabase.from("category_shipping_defaults").select("category, parent_category").eq("category", parent).maybeSingle();
    if (!p) return { error: "Categoria-mãe não encontrada." };
    if (p.parent_category) return { error: "Use uma categoria principal como mãe (só um nível de subcategoria)." };
  }
  const row = {
    category: name,
    name_en: i.nameEn.trim() || null,
    name_es: i.nameEs.trim() || null,
    parent_category: parent || null,
    ncm: ncm || null,
    hs_code: hs || null,
    weight_g: w === null ? null : Math.round(w * 1000),
    dims_cm: anyDim ? { length: dims[0], width: dims[1], height: dims[2] } : null,
    active: i.active,
    sort: Math.round(num(i.sort)) || 0,
    updated_at: new Date().toISOString(),
  };

  const original = i.original.trim();
  if (original && original !== name) {
    const { error } = await supabase.from("category_shipping_defaults").update(row).eq("category", original);
    if (error) return { error: error.message.includes("duplicate") ? "Já existe uma categoria com esse nome." : error.message };
    await supabase.from("products").update({ category: name }).eq("category", original);
  } else if (original) {
    const { error } = await supabase.from("category_shipping_defaults").update(row).eq("category", original);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("category_shipping_defaults").insert(row);
    if (error) return { error: error.message.includes("duplicate") ? "Já existe uma categoria com esse nome." : error.message };
  }

  const { data: count } = await supabase.rpc("reapply_category", { p_category: name });
  refresh();
  return { ok: true, count: Number(count) || 0 };
}

export async function deleteCategory(name: string): Promise<Result> {
  const g = await guardStaff();
  if (!g.staff) return { error: g.error };
  const supabase = await createClient();
  const [{ count: products }, { count: children }] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("category", name).neq("status", "archived"),
    supabase.from("category_shipping_defaults").select("category", { count: "exact", head: true }).eq("parent_category", name),
  ]);
  if ((children ?? 0) > 0) return { error: "Exclua ou mova as subcategorias antes." };
  if ((products ?? 0) > 0) return { error: `Há ${products} produto(s) nesta categoria. Troque a categoria deles antes, ou apenas desative a categoria.` };
  const { error } = await supabase.from("category_shipping_defaults").delete().eq("category", name);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

export interface SupplierWeightInput {
  category: string;
  connectorId: string;
  weightKg: string;
  length: string;
  width: string;
  height: string;
}

/** Weight / dimensions of one supplier for one category (wins over the category values). */
export async function saveSupplierWeight(i: SupplierWeightInput): Promise<Result> {
  const g = await guardStaff();
  if (!g.staff) return { error: g.error };
  if (!i.category || !i.connectorId) return { error: "Escolha o fornecedor." };
  const w = i.weightKg.trim() ? num(i.weightKg) : null;
  if (w !== null && !(w > 0)) return { error: "Peso: informe um valor em kg maior que zero." };
  const dims = [num(i.length), num(i.width), num(i.height)];
  const anyDim = [i.length, i.width, i.height].some((v) => String(v ?? "").trim() !== "");
  if (anyDim && dims.some((d) => !(d > 0))) return { error: "Medidas: preencha as três ou deixe vazias." };
  if (w === null && !anyDim) return { error: "Informe o peso ou as medidas." };
  const supabase = await createClient();
  const { error } = await supabase.from("category_supplier_defaults").upsert(
    {
      category: i.category,
      connector_id: i.connectorId,
      weight_g: w === null ? null : Math.round(w * 1000),
      dims_cm: anyDim ? { length: dims[0], width: dims[1], height: dims[2] } : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "category,connector_id" }
  );
  if (error) return { error: error.message };
  await supabase.rpc("reapply_category", { p_category: i.category });
  refresh();
  return { ok: true };
}

export async function deleteSupplierWeight(category: string, connectorId: string): Promise<Result> {
  const g = await guardStaff();
  if (!g.staff) return { error: g.error };
  const supabase = await createClient();
  const { error } = await supabase.from("category_supplier_defaults").delete().eq("category", category).eq("connector_id", connectorId);
  if (error) return { error: error.message };
  await supabase.rpc("reapply_category", { p_category: category });
  refresh();
  return { ok: true };
}
