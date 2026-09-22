"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Currency } from "@/lib/types";

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export const AVAILABLE_CURRENCIES: Currency[] = ["BRL", "USD", "EUR"];

function detectBrowserCurrency(): Currency {
  if (typeof window === "undefined" || !navigator) return "USD";
  const languages = navigator.languages ? Array.from(navigator.languages) : [navigator.language];

  for (const lang of languages) {
    if (!lang) continue;
    const l = lang.toLowerCase();
    if (l === "pt-br" || l === "pt") {
      return "BRL";
    }
    if (
      l.includes("-de") ||
      l.includes("-fr") ||
      l.includes("-es") ||
      l.includes("-it") ||
      l.includes("-nl") ||
      l.startsWith("de") ||
      l.startsWith("fr") ||
      l.startsWith("it") ||
      l.startsWith("nl") ||
      l === "pt-pt"
    ) {
      return "EUR";
    }
  }

  return "USD";
}

/**
 * Tracks the buyer's display currency. Automatically detects currency
 * from browser headers/locale on mount.
 */
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<Currency>("USD");

  useEffect(() => {
    const detected = detectBrowserCurrency();
    setCurrency(detected);
  }, []);

  const value = useMemo(() => ({ currency, setCurrency }), [currency]);

  return (
    <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
