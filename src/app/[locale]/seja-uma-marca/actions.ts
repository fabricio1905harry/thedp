"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

export interface BrandApplicationInput {
  brandName: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  instagram: string;
  country: string;
  message: string;
  locale: string;
  /** honeypot: real visitors leave it empty */
  company2?: string;
}

/** Become a Brand: stores the application (status NEW) and raises the Action Center item via trigger. */
export async function submitBrandApplication(input: BrandApplicationInput): Promise<{ ok?: boolean; error?: "invalid" | "failed" }> {
  try {
    if (input.company2) return { ok: true }; // bot: pretend success
    const clean = (v: string, max: number) => (v ?? "").trim().slice(0, max);
    const brandName = clean(input.brandName, 160);
    const contactName = clean(input.contactName, 160);
    const email = clean(input.email, 254).toLowerCase();
    if (!brandName || !contactName || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: "invalid" };

    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("brand_applications").insert({
      brand_name: brandName,
      contact_name: contactName,
      email,
      phone: clean(input.phone, 60) || null,
      website: clean(input.website, 300) || null,
      instagram: clean(input.instagram, 160) || null,
      country: clean(input.country, 80) || null,
      message: clean(input.message, 4000) || null,
      locale: ["en", "es", "pt"].includes(input.locale) ? input.locale : null,
    });
    if (error) return { error: "failed" };
    void (await headers()); // keep the action dynamic
    return { ok: true };
  } catch {
    return { error: "failed" };
  }
}
