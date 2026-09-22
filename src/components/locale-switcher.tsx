"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { useTransition } from "react";

const LABELS: Record<string, string> = { pt: "PT", en: "EN", es: "ES" };

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <select
      aria-label="Idioma"
      value={locale}
      onChange={(e) => {
        const nextLocale = e.target.value;
        startTransition(() => {
          router.replace(pathname, { locale: nextLocale });
        });
      }}
      className="text-sm border border-border bg-background px-2 py-1 rounded-none"
    >
      {routing.locales.map((l) => (
        <option key={l} value={l}>
          {LABELS[l]}
        </option>
      ))}
    </select>
  );
}
