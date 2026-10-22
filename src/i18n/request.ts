import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import { applyOverrides } from "@/lib/ui-texts";
import { getUiOverrides } from "@/lib/ui-texts-server";
import { deepMerge, loadExtraMessages } from "./extra-messages";

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
