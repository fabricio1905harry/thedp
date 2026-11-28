import type { SupabaseClient } from "@supabase/supabase-js";

/** product id → product code (TDP reference), for the Admin lists that only carry product ids. Never throws. */
export async function getProductCodes(supabase: SupabaseClient, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  try {
    for (let i = 0; i < unique.length; i += 500) {
      const { data } = await supabase.from("products").select("id, tdp_ref").in("id", unique.slice(i, i + 500));
      for (const p of data ?? []) if (p.tdp_ref) out.set(p.id as string, p.tdp_ref as string);
    }
  } catch {
    /* codes are informative only */
  }
  return out;
}
