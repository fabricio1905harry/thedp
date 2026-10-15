import { createServiceRoleClient } from "@/lib/supabase/server";
import { FX_QUOTES, type FxQuote } from "@/lib/fx";

/**
 * Automatic FX (daily cron + "UPDATE FX NOW"). Source: Frankfurter (ECB
 * reference rates, free, no key) — override with FX_API_URL. Each run adds
 * one fx_rates row per currency (source = 'auto'); the existing trigger
 * recomputes USD/EUR prices. Manual entry keeps working as before.
 *
 * Success → Information (system_events). Failure → Action Center
 * "FX Update Failed" (auto-resolved by the next successful update).
 */
const DEFAULT_FX_API_URL = "https://api.frankfurter.dev/v1/latest?base=BRL&symbols=USD,EUR";

/** Parses `{ base: "BRL", rates: { USD: 0.18, EUR: 0.16 } }` into BRL-per-unit rates. */
export function parseBrlRates(payload: unknown): Record<FxQuote, number> {
  const body = (payload ?? {}) as { base?: string; rates?: Record<string, unknown> };
  if (String(body.base ?? "").toUpperCase() !== "BRL" || !body.rates) {
    throw new Error("Unexpected FX payload");
  }
  const out = {} as Record<FxQuote, number>;
  for (const quote of FX_QUOTES) {
    const perBrl = Number(body.rates[quote]);
    if (!Number.isFinite(perBrl) || perBrl <= 0) throw new Error(`Missing ${quote} rate`);
    out[quote] = Math.round((1 / perBrl) * 1e6) / 1e6;
  }
  return out;
}

export async function updateFxRatesNow(trigger: "cron" | "manual", staffId?: string) {
  const supabase = createServiceRoleClient();
  try {
    const res = await fetch(process.env.FX_API_URL || DEFAULT_FX_API_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`FX provider HTTP ${res.status}`);
    const rates = parseBrlRates(await res.json());

    const { error } = await supabase.from("fx_rates").insert(
      FX_QUOTES.map((quote) => ({
        base: "BRL",
        quote,
        rate: rates[quote],
        source: "auto",
        updated_by: staffId ?? null,
      }))
    );
    if (error) throw new Error(error.message);

    await supabase.rpc("resolve_action", { p_dedupe: "fx_update_failed" });
    await supabase.rpc("log_system_event", {
      p_level: "info",
      p_type: "fx_updated",
      p_message: `FX updated (${trigger}): USD ${rates.USD} · EUR ${rates.EUR} BRL`,
    });
    return { ok: true as const, rates };
  } catch (err) {
    const message = err instanceof Error ? err.message : "FX update failed";
    await supabase.rpc("raise_action", {
      p_type: "fx_update_failed",
      p_dedupe: "fx_update_failed",
      p_title: `FX update failed: ${message}`,
      p_href: "/admin/cambio",
      p_severity: "high",
    });
    await supabase.rpc("log_system_event", { p_level: "error", p_type: "fx_update_failed", p_message: message });
    return { ok: false as const, error: message };
  }
}
