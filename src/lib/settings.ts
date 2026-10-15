import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeWhatsAppSettings, type WhatsAppSettings } from "@/lib/whatsapp";

/** Server-only reader for app_settings (staff-only table, read via service role). */
export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
    return (data?.value as T) ?? null;
  } catch {
    return null;
  }
}

export async function getWhatsAppSettings(): Promise<WhatsAppSettings | null> {
  const value = await getSetting("whatsapp");
  return value ? normalizeWhatsAppSettings(value) : null;
}
