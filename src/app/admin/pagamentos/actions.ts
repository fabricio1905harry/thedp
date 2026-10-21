"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";

async function requireStaff() {
  const staff = await getCurrentStaff();
  if (!staff) throw new Error("Não autorizado");
  return staff;
}

/** Channel default (always explicit) for one payment method. */
export async function setChannelPaymentDefault(channelCode: string, methodCode: string, enabled: boolean) {
  const staff = await requireStaff();
  const supabase = await createClient();
  await supabase.from("payment_method_rules").delete().eq("scope", "channel").eq("channel_code", channelCode).eq("method_code", methodCode);
  const { error } = await supabase
    .from("payment_method_rules")
    .insert({ scope: "channel", channel_code: channelCode, method_code: methodCode, enabled, updated_by: staff.id });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/pagamentos");
}

/** Customer exception (null = inherit the channel default). */
export async function setCustomerPaymentRule(customerEmail: string, methodCode: string, enabled: boolean | null) {
  const staff = await requireStaff();
  const supabase = await createClient();
  const { data: customer } = await supabase.from("customers").select("id").eq("email", customerEmail.trim()).maybeSingle();
  if (!customer) throw new Error(`Cliente não encontrado: ${customerEmail}`);
  await supabase.from("payment_method_rules").delete().eq("scope", "customer").eq("customer_id", customer.id).eq("method_code", methodCode);
  if (enabled !== null) {
    const { error } = await supabase
      .from("payment_method_rules")
      .insert({ scope: "customer", customer_id: customer.id, method_code: methodCode, enabled, updated_by: staff.id });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/admin/pagamentos");
}

const NUMERIC_SETTINGS = new Set(["bank_processing_fee_brl", "reserve_markup_pct", "margin_target_pct"]);

export async function saveNumericSetting(key: string, formData: FormData) {
  const staff = await requireStaff();
  if (!NUMERIC_SETTINGS.has(key)) throw new Error("Configuração desconhecida");
  const raw = String(formData.get("value") ?? "").trim();
  const value = raw === "" ? null : Number(raw);
  if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error("O valor deve ser um número positivo.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: staff.id });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/pagamentos");
}

/** Bank details shown to the buyer when Bank Transfer is enabled for the order. */
export async function saveBankInstructions(formData: FormData) {
  const staff = await requireStaff();
  const value = String(formData.get("instructions") ?? "").slice(0, 2000);
  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "bank_transfer_instructions", value, updated_at: new Date().toISOString(), updated_by: staff.id });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/pagamentos");
}
