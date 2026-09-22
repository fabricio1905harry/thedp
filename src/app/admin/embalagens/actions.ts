"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";

/**
 * Server Actions are reachable via direct POST requests regardless of
 * whether the /admin UI rendered them, so every exported action here must
 * independently re-check staff status — the admin layout's gate only
 * protects page rendering, not these endpoints.
 */
async function requireStaff() {
  const staff = await getCurrentStaff();
  if (!staff) throw new Error("Não autorizado");
  return staff;
}

export async function savePackagingType(formData: FormData) {
  await requireStaff();
  const supabase = await createClient();

  const id = formData.get("id") ? String(formData.get("id")) : undefined;
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const lengthCm = Number(formData.get("length_cm") ?? 0);
  const widthCm = Number(formData.get("width_cm") ?? 0);
  const heightCm = Number(formData.get("height_cm") ?? 0);
  const emptyWeightKg = Number(formData.get("empty_weight_kg") ?? 0);
  const maxWeightKg = Number(formData.get("max_weight_kg") ?? 0);
  const active = formData.get("active") === "true" || formData.get("active") === "on";

  if (!code || !name) {
    return { success: false, error: "Código e Nome da embalagem são obrigatórios." };
  }

  const payload = {
    code,
    name,
    length_cm: Number.isFinite(lengthCm) && lengthCm >= 0 ? lengthCm : 0,
    width_cm: Number.isFinite(widthCm) && widthCm >= 0 ? widthCm : 0,
    height_cm: Number.isFinite(heightCm) && heightCm >= 0 ? heightCm : 0,
    empty_weight_kg: Number.isFinite(emptyWeightKg) && emptyWeightKg >= 0 ? emptyWeightKg : 0,
    max_weight_kg: Number.isFinite(maxWeightKg) && maxWeightKg >= 0 ? maxWeightKg : 0,
    active,
  };

  const { error } = id
    ? await supabase.from("packaging_types").update(payload).eq("id", id)
    : await supabase.from("packaging_types").insert(payload);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/embalagens");
  return { success: true };
}

export async function togglePackagingType(id: string, active: boolean) {
  await requireStaff();
  const supabase = await createClient();
  await supabase.from("packaging_types").update({ active }).eq("id", id);
  revalidatePath("/admin/embalagens");
  return { success: true };
}

export async function saveCapacityRule(formData: FormData) {
  await requireStaff();
  const supabase = await createClient();

  const id = formData.get("id") ? String(formData.get("id")) : undefined;
  const packagingTypeId = String(formData.get("packaging_type_id") ?? "");
  const category = String(formData.get("category") ?? "").trim();
  const minQuantity = Number(formData.get("min_quantity") ?? 1);
  const maxQuantity = Number(formData.get("max_quantity") ?? 20);
  const active = formData.get("active") === "true" || formData.get("active") === "on";

  if (!packagingTypeId || !category) {
    return { success: false, error: "Embalagem e Categoria são obrigatórios." };
  }

  const payload = {
    packaging_type_id: packagingTypeId,
    category,
    min_quantity: Number.isFinite(minQuantity) && minQuantity >= 1 ? minQuantity : 1,
    max_quantity: Number.isFinite(maxQuantity) && maxQuantity >= 1 ? maxQuantity : 1,
    active,
  };

  const { error } = id
    ? await supabase.from("packaging_capacity_rules").update(payload).eq("id", id)
    : await supabase.from("packaging_capacity_rules").insert(payload);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/embalagens");
  return { success: true };
}

export async function toggleCapacityRule(id: string, active: boolean) {
  await requireStaff();
  const supabase = await createClient();
  await supabase.from("packaging_capacity_rules").update({ active }).eq("id", id);
  revalidatePath("/admin/embalagens");
  return { success: true };
}
