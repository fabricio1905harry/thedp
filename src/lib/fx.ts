import { createClient } from "@/lib/supabase/server";

export type FxQuote = "USD" | "EUR";
export const FX_QUOTES: FxQuote[] = ["USD", "EUR"];

/** Days after which a manually-entered rate is flagged stale in the admin. */
export const FX_STALE_DAYS = 3;

export interface FxRateInfo {
  rate: number;
  fetchedAt: string;
  updatedByEmail: string | null;
}

/**
 * Manual rates only (no external API) — reads the latest fx_rates row per
 * quote currency. A currency with no row yet simply isn't offered in the
 * switcher (see CurrencyProvider) rather than silently converting 1:1.
 */
export async function getLatestFxRates(): Promise<Record<FxQuote, FxRateInfo | null>> {
  const result: Record<FxQuote, FxRateInfo | null> = { USD: null, EUR: null };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return result;

  try {
    const supabase = await createClient();
    for (const quote of FX_QUOTES) {
      const { data } = await supabase
        .from("fx_rates")
        .select("rate, fetched_at, updated_by, customers(email)")
        .eq("base", "BRL")
        .eq("quote", quote)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        result[quote] = {
          rate: Number(data.rate),
          fetchedAt: data.fetched_at,
          updatedByEmail: (data.customers as unknown as { email: string } | null)?.email ?? null,
        };
      }
    }
  } catch {
    // leave as nulls — pages fall back to BRL-only display
  }

  return result;
}

export function isStale(fetchedAt: string): boolean {
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  return ageMs > FX_STALE_DAYS * 24 * 60 * 60 * 1000;
}
