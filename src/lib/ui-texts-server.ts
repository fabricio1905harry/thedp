import { createContentReader } from "@/lib/supabase/public";
import type { UiOverrides } from "@/lib/ui-texts";

let cache: { at: number; value: UiOverrides } | null = null;
const TTL_MS = 10_000;

export function clearUiOverridesCache() {
  cache = null;
}

/** Current overrides (cached for a few seconds so every request doesn't hit the database). */
export async function getUiOverrides(): Promise<UiOverrides> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value: UiOverrides = {};
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const { client: supabase } = await createContentReader();
      const { data } = await supabase
        .from("cms_blocks")
        .select("content")
        .eq("scope", "site")
        .eq("block_key", "ui_texts")
        .maybeSingle();
      value = (data?.content as UiOverrides | null) ?? {};
    } catch {
      value = {};
    }
  }
  cache = { at: Date.now(), value };
  return value;
}
