import { cache } from "react";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Color normalization (migration 0050). The supplier's color text lives in
 * variants.color and stays INTERNAL (admin only); buyers see the TDP color
 * name in their language and filter by the normalized color id.
 * A supplier color that is not mapped yet keeps its text on the product
 * page (so the variant stays sellable) but never becomes a filter option.
 */

export interface TdpColor {
  id: string;
  name: string;
  hex: string | null;
}

export interface ColorResolver {
  /** Buyer-facing label (TDP name in the locale; supplier text when unmapped). */
  label: (raw: string | null | undefined) => string;
  /** Normalized color id, or null when the supplier color is not mapped. */
  id: (raw: string | null | undefined) => string | null;
  hex: (raw: string | null | undefined) => string | null;
  /** Normalized colors in display order, named in the locale. */
  options: TdpColor[];
  name: (id: string) => string;
}

export function colorKey(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

const EMPTY: ColorResolver = {
  label: (raw) => raw ?? "",
  id: () => null,
  hex: () => null,
  options: [],
  name: (id) => id,
};

export const getColorResolver = cache(async (locale: string): Promise<ColorResolver> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return EMPTY;
  try {
    const service = createServiceRoleClient();
    const [{ data: colors }, { data: map }] = await Promise.all([
      service.from("tdp_colors").select("id, name_en, name_es, name_pt, hex, sort, active").order("sort"),
      service.from("supplier_color_map").select("supplier_key, tdp_color_id"),
    ]);
    const pick = (c: { name_en: string; name_es: string; name_pt: string }) =>
      (locale === "es" ? c.name_es : locale === "pt" ? c.name_pt : c.name_en) || c.name_en;
    const byId = new Map<string, TdpColor>();
    for (const c of colors ?? []) {
      if (c.active) byId.set(c.id, { id: c.id, name: pick(c), hex: c.hex });
    }
    const bySupplier = new Map<string, string>();
    for (const m of map ?? []) {
      if (m.tdp_color_id && byId.has(m.tdp_color_id)) bySupplier.set(m.supplier_key, m.tdp_color_id);
    }
    const idOf = (raw: string | null | undefined) => bySupplier.get(colorKey(raw)) ?? null;
    return {
      label: (raw) => {
        const id = idOf(raw);
        return id ? byId.get(id)!.name : (raw ?? "").trim();
      },
      id: idOf,
      hex: (raw) => {
        const id = idOf(raw);
        return id ? byId.get(id)!.hex : null;
      },
      options: [...byId.values()],
      name: (id) => byId.get(id)?.name ?? id,
    };
  } catch {
    return EMPTY;
  }
});
