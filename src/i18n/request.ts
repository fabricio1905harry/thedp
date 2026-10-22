import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import { applyOverrides } from "@/lib/ui-texts";
import { getUiOverrides } from "@/lib/ui-texts-server";

/**
 * Per-stream message fragments (src/messages/extra/<name>.<locale>.json) are
 * deep-merged over the main messages. Add a name here when adding a fragment.
 */
const EXTRA_FRAGMENTS = ["commercial", "catalog", "content", "logistics", "ops"];

type Json = Record<string, unknown>;

function deepMerge(base: Json, extra: Json): Json {
  const out: Json = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    const cur = out[k];
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) && cur && typeof cur === "object" && !Array.isArray(cur)
        ? deepMerge(cur as Json, v as Json)
        : v;
  }
  return out;
}

async function loadExtraMessages(locale: string): Promise<Json> {
  let merged: Json = {};
  for (const name of EXTRA_FRAGMENTS) {
    try {
      const mod = await import(`../messages/extra/${name}.${locale}.json`);
      merged = deepMerge(merged, (mod.default ?? {}) as Json);
    } catch {
      // fragment not present for this locale
    }
  }
  return merged;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const base = deepMerge((await import(`../messages/${locale}.json`)).default, await loadExtraMessages(locale));
  const overrides = await getUiOverrides();

  return {
    locale,
    // built-in messages ← texts edited by the super admin (Admin → Textos da interface)
    messages: Object.keys(overrides).length > 0 ? applyOverrides(base, overrides, locale) : base,
  };
});
