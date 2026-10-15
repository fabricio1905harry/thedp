"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";
import { normalizeWhatsAppSettings } from "@/lib/whatsapp";

export async function saveWhatsAppSettings(formData: FormData) {
  const staff = await getCurrentStaff();
  if (!staff) throw new Error("Not authorized");
  const messages: Record<string, Record<string, string>> = {};
  for (const kind of ["general", "product", "order"]) {
    messages[kind] = {};
    for (const loc of ["en", "es", "pt"]) {
      messages[kind][loc] = String(formData.get(`${kind}_${loc}`) ?? "").slice(0, 500);
    }
  }
  const value = normalizeWhatsAppSettings({
    active: formData.get("active") === "on",
    number: String(formData.get("number") ?? ""),
    messages,
  });
  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "whatsapp", value, updated_at: new Date().toISOString(), updated_by: staff.id });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/whatsapp");
  revalidatePath("/", "layout");
}
