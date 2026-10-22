import { createServiceRoleClient } from "@/lib/supabase/server";
import { FX_QUOTES, type FxQuote } from "@/lib/fx";

/**
 * Automatic FX (cron + "UPDATE FX NOW"). Configurable in Admin → Câmbio
 * (app_settings.fx_auto, migration 0063):
 *   source     "ecb"  — Frankfurter (ECB reference rates, free, no key; override with FX_API_URL)
 *              "ptax" — Banco Central do Brasil PTAX (open data, OData) — sell rate of the last business day
 *   frequency  "daily" | "weekly"  — respected by the cron (src/app/api/cron/daily/route.ts)
 * Each run adds one fx_rates row per currency (source = 'auto', provider = ecb|ptax); the existing
 * trigger recomputes USD/EUR prices. Manual entry keeps working as before.
 *
 * Success → Information (system_events). Failure (network, bad payload) → the LAST RATE IS KEPT and
 * the Action Center gets "FX Update Failed" (auto-resolved by the next successful update).
 */
const DEFAULT_FX_API_URL = "https://api.frankfurter.dev/v1/latest?base=BRL&symbols=USD,EUR";
const PTAX_BASE = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata";

export type FxSource = "ecb" | "ptax";
export type FxFrequency = "daily" | "weekly";

export interface FxAutoSettings {
  enabled: boolean;
  source: FxSource;
  frequency: FxFrequency;
  last_run: { at: string; ok: boolean; source: FxSource; message: string; trigger?: string } | null;
}

export function normalizeFxSettings(value: unknown): FxAutoSettings {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const lr = v.last_run as FxAutoSettings["last_run"] | undefined;
  return {
    enabled: v.enabled !== false,
    source: v.source === "ptax" ? "ptax" : "ecb",
    frequency: v.frequency === "weekly" ? "weekly" : "daily",
    last_run: lr && typeof lr === "object" && lr.at ? lr : null,
  };
}

export async function getFxSettings(): Promise<FxAutoSettings> {
  try {
    const { data } = await createServiceRoleClient().from("app_settings").select("value").eq("key", "fx_auto").maybeSingle();
    return normalizeFxSettings(data?.value);
  } catch {
    return normalizeFxSettings(null);
  }
}

/** Whether the cron should run now, given the frequency and the last successful run. */
export function fxRunIsDue(settings: FxAutoSettings, now = Date.now()): boolean {
  if (!settings.enabled) return false;
  if (settings.frequency === "daily") return true;
  const last = settings.last_run;
  if (!last || !last.ok) return true; // never ran / last attempt failed → retry
  return now - new Date(last.at).getTime() >= 6.5 * 24 * 3600 * 1000;
}

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

/** Last bulletin's sell rate (cotacaoVenda) from a PTAX OData response; null when the day has no quote. */
export function parsePtaxDay(payload: unknown): number | null {
  const list = ((payload ?? {}) as { value?: { cotacaoVenda?: unknown }[] }).value;
  if (!Array.isArray(list) || list.length === 0) return null;
  const rate = Number(list[list.length - 1]?.cotacaoVenda);
  return Number.isFinite(rate) && rate > 0 ? Math.round(rate * 1e6) / 1e6 : null;
}

function ptaxDate(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}-${dd}-${d.getUTCFullYear()}`;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`FX provider HTTP ${res.status}`);
  return res.json();
}

async function fetchPtaxRate(quote: FxQuote, now = new Date()): Promise<number> {
  // weekends / bank holidays have no bulletin: walk back up to 10 days
  for (let back = 0; back < 10; back++) {
    const date = ptaxDate(new Date(now.getTime() - back * 24 * 3600 * 1000));
    const url =
      quote === "USD"
        ? `${PTAX_BASE}/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${date}'&$format=json`
        : `${PTAX_BASE}/CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)?@moeda='${quote}'&@dataCotacao='${date}'&$format=json`;
    const rate = parsePtaxDay(await fetchJson(url));
    if (rate) return rate;
  }
  throw new Error(`PTAX: no ${quote} quote in the last 10 days`);
}

export async function fetchRates(source: FxSource): Promise<Record<FxQuote, number>> {
  if (source === "ptax") {
    const [USD, EUR] = await Promise.all([fetchPtaxRate("USD"), fetchPtaxRate("EUR")]);
    return { USD, EUR } as Record<FxQuote, number>;
  }
  return parseBrlRates(await fetchJson(process.env.FX_API_URL || DEFAULT_FX_API_URL));
}

export async function updateFxRatesNow(trigger: "cron" | "manual", staffId?: string) {
  const supabase = createServiceRoleClient();
  const settings = await getFxSettings();
  const stamp = async (ok: boolean, message: string) => {
    try {
      await supabase.from("app_settings").upsert({
        key: "fx_auto",
        value: { ...settings, last_run: { at: new Date().toISOString(), ok, source: settings.source, message, trigger } },
        updated_at: new Date().toISOString(),
      });
    } catch {
      // bookkeeping only
    }
  };

  try {
    const rates = await fetchRates(settings.source);

    const rows = FX_QUOTES.map((quote) => ({
      base: "BRL",
      quote,
      rate: rates[quote],
      source: "auto",
      updated_by: staffId ?? null,
    }));
    let { error } = await supabase.from("fx_rates").insert(rows.map((r) => ({ ...r, provider: settings.source })));
    if (error && /provider/i.test(error.message)) {
      // migration 0063 not applied yet: store without the provider column
      ({ error } = await supabase.from("fx_rates").insert(rows));
    }
    if (error) throw new Error(error.message);

    const message = `USD ${rates.USD} · EUR ${rates.EUR} BRL (${settings.source === "ptax" ? "PTAX/BCB" : "BCE"})`;
    await supabase.rpc("resolve_action", { p_dedupe: "fx_update_failed" });
    await supabase.rpc("log_system_event", { p_level: "info", p_type: "fx_updated", p_message: `FX updated (${trigger}): ${message}` });
    await stamp(true, message);
    return { ok: true as const, rates };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "FX update failed";
    // network failures surface as "fetch failed": keep the last stored rate and say so
    const message = `${raw} — a última cotação salva foi mantida`;
    await supabase.rpc("raise_action", {
      p_type: "fx_update_failed",
      p_dedupe: "fx_update_failed",
      p_title: `FX update failed: ${message}`,
      p_href: "/admin/cambio",
      p_severity: "high",
    });
    await supabase.rpc("log_system_event", { p_level: "error", p_type: "fx_update_failed", p_message: message });
    await stamp(false, message);
    return { ok: false as const, error: message };
  }
}
