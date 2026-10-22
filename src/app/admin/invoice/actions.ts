"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";
import { DEFAULT_INVOICE_TEMPLATE, issueInvoice, type InvoiceTemplate } from "@/lib/invoice";

export type ActionResult = { error?: string; info?: string };

export async function generateInvoiceAction(orderId: string, regenerate: boolean): Promise<ActionResult> {
  try {
    const staff = await getCurrentStaff();
    if (!staff) return { error: "Não autorizado" };
    const invoice = await issueInvoice(orderId, staff.id, regenerate);
    revalidatePath(`/admin/pedidos/${orderId}`);
    return { info: `Invoice ${invoice.number} ${regenerate ? "regerada" : "gerada"}.` };
  } catch (err) {
    console.error("[admin/invoice]", err);
    return { error: err instanceof Error ? err.message : "Falha ao gerar a invoice." };
  }
}

export async function saveInvoiceTemplate(input: InvoiceTemplate): Promise<ActionResult> {
  try {
    const staff = await getCurrentStaff();
    if (!staff) return { error: "Não autorizado" };
    const value: Record<string, string> = {};
    for (const key of Object.keys(DEFAULT_INVOICE_TEMPLATE) as (keyof InvoiceTemplate)[]) {
      value[key] = String(input[key] ?? "").slice(0, 4000);
    }
    if (!/^[A-Za-z0-9]{1,8}$/.test(value.number_prefix)) return { error: "Prefixo da numeração: 1 a 8 letras/números." };
    if (!value.company_name.trim()) return { error: "Informe o nome da empresa." };
    value.company_country_code = value.company_country_code.toUpperCase().slice(0, 2);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("app_settings")
      .upsert({ key: "invoice_template", value, updated_at: new Date().toISOString(), updated_by: staff.id }, { onConflict: "key" })
      .select("key");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "Nada foi salvo (sem permissão?)." };
    revalidatePath("/admin/invoice");
    return { info: "Configurações da invoice salvas. Invoices já emitidas mudam só se forem regeradas." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao salvar." };
  }
}
