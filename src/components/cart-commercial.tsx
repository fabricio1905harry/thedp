"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useCart } from "@/components/cart-provider";
import { useCurrency } from "@/components/currency-provider";
import { formatCurrency, pickPrice } from "@/lib/currency";
import { getCartCommercialStatus } from "@/app/[locale]/carrinho/actions";
import type { CartCommercialStatus } from "@/lib/commercial-server";
import type { Shortfall } from "@/lib/order-minimums";

const NONE: CartCommercialStatus = {
  operation: null,
  shortfalls: [],
  volume: { enabled: false, lines: [], discountTotal: 0 },
};

/** Minimum-order / Volume Pricing status for the current cart (evaluated on the server). */
export function useCartCommercial() {
  const { items } = useCart();
  const { currency } = useCurrency();
  const [state, setState] = useState<{ key: string; status: CartCommercialStatus } | null>(null);

  const lines = useMemo(
    () =>
      items.map((i) => ({
        variantId: i.variantId,
        qty: i.qty,
        price: pickPrice(i.pricing, currency)?.amount ?? 0,
      })),
    [items, currency]
  );
  const key = JSON.stringify([currency, lines]);

  useEffect(() => {
    if (lines.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      getCartCommercialStatus(lines, currency)
        .then((status) => {
          if (!cancelled) setState({ key, status });
        })
        .catch(() => {
          // network hiccup: the server still enforces the rules at checkout
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, lines, currency]);

  const status = state && state.key === key ? state.status : NONE;
  return { status, ready: state?.key === key, currency };
}

/** Builds the buyer message for one unmet minimum ("Add 2 more Dresses to place your order"). */
export function useShortfallText() {
  const t = useTranslations("commercial");
  const locale = useLocale() as "en" | "es" | "pt";
  return (s: Shortfall): string => {
    const custom = s.message?.[locale] ?? s.message?.en;
    const missing = s.minType === "amount" ? formatCurrency(s.missing, s.currency) : String(s.missing);
    if (custom) return custom.replaceAll("{missing}", missing);
    const label = s.labels?.[locale] ?? s.labels?.en ?? s.label;
    if (s.minType === "units") {
      return label
        ? t("minimum.addUnitsOf", { missing: s.missing, label })
        : t("minimum.addUnits", { missing: s.missing });
    }
    return label
      ? t("minimum.addAmountOf", { missing, label, minimum: formatCurrency(s.minimum, s.currency) })
      : t("minimum.addAmount", { missing, minimum: formatCurrency(s.minimum, s.currency) });
  };
}

export function MinimumNotice({ shortfalls }: { shortfalls: Shortfall[] }) {
  const text = useShortfallText();
  const t = useTranslations("commercial");
  if (shortfalls.length === 0) return null;
  return (
    <div className="mt-6 border border-foreground p-4 space-y-1 text-sm" role="alert">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em]">{t("minimum.title")}</p>
      {shortfalls.map((s) => (
        <p key={s.ruleId}>{text(s)}</p>
      ))}
    </div>
  );
}
