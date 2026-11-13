"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";
import { normalizeWhatsAppSettings } from "@/lib/whatsapp";

export interface WhatsAppSaveState {
  status: "idle" | "ok" | "error";
  message?: string;
}

/**
 * Admin → WhatsApp. The number saved here is the ONE number of the site: floating button, footer, Contact page and
 * the "talk to our team" help on the product page all use it.
 */
export async function saveWhatsAppSettings(_prev: WhatsAppSaveState, formData: FormData): Promise<WhatsAppSaveState> {
  const staff = await getCurrentStaff();
  if (!staff) return { status: "error", message: "Sessão expirada ou sem permissão. Entre novamente." };
  const messages: Record<string, Record<string, string>> = {};
  for (const kind of ["general", "product", "order"]) {
    messages[kind] = {};
    for (const loc of ["en", "es", "pt"]) {
      messages[kind][loc] = String(formData.get(`${kind}_${loc}`) ?? "").slice(0, 500);
    }
  }
  const number = String(formData.get("number") ?? "").replace(/\D/g, "");
  const active = formData.get("active") === "on";
  if (number && (number.length < 10 || number.length > 15)) {
    return { status: "error", message: "Número inválido: use o código do país + DDD + número (10 a 15 dígitos), ex.: 55 11 99999-9999." };
  }
  if (active && !number) return { status: "error", message: "Informe o número para ativar o botão." };

  const value = normalizeWhatsAppSettings({ active, number, messages });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_settings")
    .upsert({ key: "whatsapp", value, updated_at: new Date().toISOString(), updated_by: staff.id }, { onConflict: "key" })
    .select("key");
  if (error) return { status: "error", message: error.message };
  if (!data?.length) return { status: "error", message: "Nada foi salvo (sem permissão?)." };
  revalidatePath("/admin/whatsapp");
  revalidatePath("/", "layout");
  return {
    status: "ok",
    message: number
      ? `Salvo. O site inteiro passa a usar +${number}${active ? " e o botão flutuante está ativo" : " (botão flutuante desligado)"}.`
      : "Salvo. Sem número, o WhatsApp não aparece no site.",
  };
}
