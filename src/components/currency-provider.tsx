"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Currency } from "@/lib/types";

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export const AVAILABLE_CURRENCIES: Currency[] = ["BRL", "USD", "EUR"];

const COOKIE = "tdp_currency";

function readSaved(): Currency | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=(BRL|USD|EUR)`));
  return m ? (m[1] as Currency) : null;
}

/**
 * Buyer's display currency. It follows the sales channel, NOT the language:
 * the national site is always BRL; the international site defaults to USD
 * (the buyer can switch to EUR and the choice is remembered in a cookie).
 */
export function CurrencyProvider({
  children,
  defaultCurrency = "USD",
  locked = false,
}: {
  children: ReactNode;
  defaultCurrency?: Currency;
  /** National site: currency cannot be changed. */
  locked?: boolean;
}) {
  const [currency, setCurrencyState] = useState<Currency>(defaultCurrency);

  useEffect(() => {
    if (locked) return;
    const saved = readSaved();
    if (saved && saved !== "BRL") setCurrencyState(saved);
  }, [locked]);

  const setCurrency = (c: Currency) => {
    if (locked) return;
    setCurrencyState(c);
    document.cookie = `${COOKIE}=${c}; path=/; max-age=31536000; samesite=lax`;
  };

  const value = useMemo(() => ({ currency, setCurrency }), [currency]); // eslint-disable-line react-hooks/exhaustive-deps

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
