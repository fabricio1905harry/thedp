"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { BRAND_OPPORTUNITY_TYPES, BRAND_PRODUCT_CATEGORIES, BRAND_WHOLESALE_PRESENCE } from "@/lib/brand-application";

export interface BrandApplicationInput {
  brandName: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  instagram: string;
  country: string;
  message: string;
  /** P35 */
  productCategories?: string[];
  currentMarkets?: string;
  wholesalePresence?: string;
  opportunityType?: string;
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
    const base = {
      brand_name: brandName,
      contact_name: contactName,
      email,
      phone: clean(input.phone, 60) || null,
      website: clean(input.website, 300) || null,
      instagram: clean(input.instagram, 160) || null,
      country: clean(input.country, 80) || null,
      message: clean(input.message, 4000) || null,
      locale: ["en", "es", "pt"].includes(input.locale) ? input.locale : null,
    };
    // P35: extra fields of the PDF form (migration 0089)
    const pick = <T extends string>(v: string | undefined, allowed: readonly T[]): T | null => (allowed as readonly string[]).includes(v ?? "") ? (v as T) : null;
    const extra = {
      product_categories: (input.productCategories ?? []).filter((c) => (BRAND_PRODUCT_CATEGORIES as readonly string[]).includes(c)),
      current_markets: clean(input.currentMarkets ?? "", 300) || null,
      wholesale_presence: pick(input.wholesalePresence, BRAND_WHOLESALE_PRESENCE),
      opportunity_type: pick(input.opportunityType, BRAND_OPPORTUNITY_TYPES),
    };
    let { error } = await supabase.from("brand_applications").insert({ ...base, ...extra });
    // before migration 0089 the new columns do not exist: keep the application, drop only the extras
    if (error && /column|schema cache/i.test(error.message)) {
      ({ error } = await supabase.from("brand_applications").insert(base));
    }
    if (error) return { error: "failed" };
    void (await headers()); // keep the action dynamic
    return { ok: true };
  } catch {
    return { error: "failed" };
  }
}
