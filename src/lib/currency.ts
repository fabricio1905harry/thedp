import type { Currency, ProductPricing } from "./types";

const LOCALE_BY_CURRENCY: Record<Currency, string> = {
  BRL: "pt-BR",
  USD: "en-US",
  EUR: "de-DE",
};

export function formatCurrency(amount: number, currency: Currency): string {
  return new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency], {
    style: "currency",
    currency,
  }).format(amount);
}

/**
 * Picks the precomputed price for the requested currency (price_brl/usd/eur
 * — see the products_compute_prices/fx_rates_recompute_products triggers).
 * No conversion happens here. Falls back to BRL if the requested currency's
 * price hasn't been computed yet (e.g. no EUR rate entered in /admin/cambio).
 */
export function pickPrice(
  pricing: ProductPricing,
  currency: Currency
): { amount: number; currency: Currency; isFallback: boolean } | null {
  const byCurrency: Record<Currency, number | null> = {
    BRL: pricing.priceBrl,
    USD: pricing.priceUsd,
    EUR: pricing.priceEur,
  };

  const requested = byCurrency[currency];
  if (requested !== null && requested !== undefined) {
    return { amount: requested, currency, isFallback: false };
  }
  if (pricing.priceBrl !== null && pricing.priceBrl !== undefined) {
    return { amount: pricing.priceBrl, currency: "BRL", isFallback: true };
  }
  return null;
}

export function convertPriceBrl(
  amountBrl: number,
  targetCurrency: Currency,
  rate: number | null
): number | null {
  if (targetCurrency === "BRL") {
    return Math.round(amountBrl * 100) / 100;
  }
  if (!rate || rate <= 0) return null;
  return Math.round((amountBrl / rate) * 100) / 100;
}

export function formatPicked(pricing: ProductPricing, currency: Currency): string | null {
  const picked = pickPrice(pricing, currency);
  if (!picked) return null;
  return formatCurrency(picked.amount, picked.currency);
}
