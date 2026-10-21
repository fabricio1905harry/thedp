"use client";

import type { Currency } from "@/lib/types";
import { useCurrency } from "@/components/currency-provider";

const INTERNATIONAL: Currency[] = ["USD", "EUR"];

export function CurrencySwitcher() {
  const { currency, setCurrency } = useCurrency();

  return (
    <select
      aria-label="Currency"
      value={currency === "BRL" ? "USD" : currency}
      onChange={(e) => setCurrency(e.target.value as Currency)}
      className="text-sm border border-border bg-background px-2 py-1 rounded-sm"
    >
      {INTERNATIONAL.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
