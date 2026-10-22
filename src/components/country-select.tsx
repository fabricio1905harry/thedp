"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { countryOptions, filterCountries } from "@/lib/countries";

/**
 * Searchable country picker (all ISO countries, localized names). The value
 * is the ISO alpha-2 code; pass `name` to submit it with a plain <form>.
 */
export function CountrySelect({
  value,
  onChange,
  name,
  required,
  className = "",
}: {
  value: string;
  onChange: (code: string) => void;
  name?: string;
  required?: boolean;
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("countrySelect");
  const [query, setQuery] = useState("");
  const all = useMemo(() => countryOptions(locale), [locale]);
  const filtered = useMemo(() => {
    const list = filterCountries(all, query);
    // keep the current selection visible while searching
    if (value && !list.some((o) => o.code === value)) {
      const current = all.find((o) => o.code === value);
      if (current) return [current, ...list];
    }
    return list;
  }, [all, query, value]);

  return (
    <div className="space-y-1.5">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("search")}
        aria-label={t("search")}
        className={className}
      />
      <select
        name={name}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className={`${className} cursor-pointer`}
      >
        <option value="" disabled>
          {t("choose")}
        </option>
        {filtered.map((o) => (
          <option key={o.code} value={o.code}>
            {o.name} ({o.code})
          </option>
        ))}
      </select>
    </div>
  );
}
