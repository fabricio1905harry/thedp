"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { guardStaff } from "@/lib/admin-guard";

type Result = { error?: string; ok?: boolean };

export interface SupplierInput {
  /** empty for a new supplier */
  id: string;
  name: string;
  url: string;
  status: "active" | "pending" | "not_built";
  includedInContract: boolean;
}

const STATUSES = ["active", "pending", "not_built"] as const;

function cleanUrl(raw: string): string | null | "invalid" {
  const v = raw.trim();
  if (!v) return null;
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withProto);
    if (!u.hostname.includes(".")) return "invalid";
    return u.toString().slice(0, 500);
  } catch {
    return "invalid";
  }
}

function refresh() {
  revalidatePath("/admin/automacao");
  revalidatePath("/admin/categorias");
  revalidatePath("/admin/produtos");
}

/** Registers / edits a supplier (connector): name and site URL, plus status and contract. */
export async function saveSupplier(i: SupplierInput): Promise<Result> {
  const g = await guardStaff();
  if (!g.staff) return { error: g.error };
  const name = i.name.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!name) return { error: "Informe o nome do fornecedor." };
  const url = cleanUrl(i.url);
  if (url === "invalid") return { error: "URL inválida. Ex.: https://www.fornecedor.com.br" };
  const status = STATUSES.includes(i.status) ? i.status : "not_built";

  const supabase = await createClient();
  const row = { supplier_name: name, supplier_url: url, status, included_in_contract: i.includedInContract, updated_at: new Date().toISOString() };
  const { error } = i.id
    ? await supabase.from("connectors").update(row).eq("id", i.id)
    : await supabase.from("connectors").insert(row);
  if (error) {
    if (error.message.includes("connectors_supplier_name_key") || error.code === "23505") return { error: "Já existe um fornecedor com esse nome." };
    if (/supplier_url|updated_at/.test(error.message)) return { error: "Rode a migration 0091 no Supabase para salvar a URL do fornecedor." };
    return { error: error.message };
  }
  refresh();
  return { ok: true };
}

/** Removes a supplier that has no products and no sync history yet (otherwise set it as "não construído"). */
export async function deleteSupplier(id: string): Promise<Result> {
  const g = await guardStaff();
  if (!g.staff) return { error: g.error };
  const supabase = await createClient();
  const [{ count: products }, { count: links }, { count: runs }] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("connector_id", id),
    supabase.from("product_connectors").select("product_id", { count: "exact", head: true }).eq("connector_id", id),
    supabase.from("sync_runs").select("id", { count: "exact", head: true }).eq("connector_id", id),
  ]);
  if ((products ?? 0) + (links ?? 0) > 0) return { error: "Há produtos vinculados a este fornecedor. Desvincule-os antes de excluir." };
  if ((runs ?? 0) > 0) return { error: "Este fornecedor já tem sincronizações registradas; mude o status em vez de excluir." };
  const { error } = await supabase.from("connectors").delete().eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}
