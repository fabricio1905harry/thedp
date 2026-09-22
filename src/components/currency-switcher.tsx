"use client";

import type { Currency } from "@/lib/types";
import { useCurrency, AVAILABLE_CURRENCIES } from "@/components/currency-provider";

export function CurrencySwitcher() {
  const { currency, setCurrency } = useCurrency();

  return (
    <select
      aria-label="Currency"
      value={currency}
      onChange={(e) => setCurrency(e.target.value as Currency)}
      className="text-sm border border-border bg-background px-2 py-1 rounded-none"
    >
      {AVAILABLE_CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
