import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import { applyOverrides } from "@/lib/ui-texts";
import { getUiOverrides } from "@/lib/ui-texts-server";

type Json = Record<string, unknown>;

/** Deep-merges the catalog fragments (src/messages/extra/catalog.<locale>.json) over the main messages. */
function deepMerge(base: Json, extra: Json): Json {
  const out: Json = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const current = out[key];
    out[key] =
      value && typeof value === "object" && !Array.isArray(value) && current && typeof current === "object" && !Array.isArray(current)
        ? deepMerge(current as Json, value as Json)
        : value;
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const main = (await import(`../messages/${locale}.json`)).default as Json;
  const extra = (await import(`../messages/extra/catalog.${locale}.json`).catch(() => ({ default: {} }))).default as Json;
  const base = deepMerge(main, extra);
  const overrides = await getUiOverrides();

  return {
    locale,
    // built-in messages ← texts edited by the super admin (Admin → Textos da interface)
    messages: Object.keys(overrides).length > 0 ? applyOverrides(base, overrides, locale) : base,
  };
});
