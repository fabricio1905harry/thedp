import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import { applyOverrides } from "@/lib/ui-texts";
import { getUiOverrides } from "@/lib/ui-texts-server";

type Json = Record<string, unknown>;
function deepMerge(a: Json, b: Json): Json {
  const out: Json = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) && cur && typeof cur === "object" && !Array.isArray(cur)
        ? deepMerge(cur as Json, v as Json)
        : v;
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const main = (await import(`../messages/${locale}.json`)).default;
  // homologation fragments (src/messages/extra/homolog.<locale>.json) deep-merged over the main messages
  const extra = (await import(`../messages/extra/homolog.${locale}.json`)).default;
  const base = deepMerge(main, extra);
  const overrides = await getUiOverrides();

  return {
    locale,
    // built-in messages ← texts edited by the super admin (Admin → Textos da interface)
    messages: Object.keys(overrides).length > 0 ? applyOverrides(base, overrides, locale) : base,
  };
});
