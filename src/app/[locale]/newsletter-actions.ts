"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";

/** Footer newsletter: stores the e-mail once (duplicates are accepted silently). */
export async function subscribeNewsletter(email: string, locale: string): Promise<{ ok: boolean }> {
  try {
    const value = (email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) || value.length > 254) return { ok: false };
    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from("newsletter_subscribers")
      .insert({ email: value, locale: ["en", "es", "pt"].includes(locale) ? locale : null, source: "footer" });
    // 23505 = already subscribed: same outcome for the visitor
    if (error && error.code !== "23505") return { ok: false };
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
