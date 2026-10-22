/**
 * Duties & Taxes per market (migration 0062). A rule targets a COUNTRY
 * (ISO-2), a REGION or is the '*' fallback. Resolution: country → region → '*'.
 */
export type DutiesMode = "prepaid" | "upon_import" | "customer_choice";

export const DUTIES_MODES: DutiesMode[] = ["prepaid", "upon_import", "customer_choice"];

/** Admin (pt-BR) labels. */
export const DUTIES_MODE_LABELS_PT: Record<DutiesMode, string> = {
  prepaid: "Pré-pago (o comprador paga junto com o pedido)",
  upon_import: "Pago na importação (o comprador paga ao transportador na entrega)",
  customer_choice: "Escolha do cliente (pré-pago ou na importação)",
};

export interface DutiesRule {
  id: string;
  market_type: "country" | "region" | "default";
  market: string;
  mode: DutiesMode;
  default_pct: number | null;
  note: string | null;
  active: boolean;
}

export const REGIONS: Record<string, { label: string; countries: string[] }> = {
  EU: {
    label: "União Europeia",
    countries: ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"],
  },
  UK_EFTA: { label: "Reino Unido e EFTA", countries: ["GB", "CH", "NO", "IS", "LI"] },
  NORTH_AMERICA: { label: "América do Norte", countries: ["US", "CA", "MX"] },
  LATAM: {
    label: "América Latina",
    countries: ["AR", "BO", "BR", "CL", "CO", "CR", "CU", "DO", "EC", "GT", "HN", "NI", "PA", "PY", "PE", "SV", "UY", "VE"],
  },
  MIDDLE_EAST: { label: "Oriente Médio", countries: ["AE", "SA", "QA", "KW", "BH", "OM", "IL", "JO", "LB", "TR"] },
  ASIA_PACIFIC: { label: "Ásia-Pacífico", countries: ["AU", "NZ", "JP", "KR", "CN", "HK", "SG", "TW", "TH", "MY", "ID", "PH", "VN", "IN"] },
  AFRICA: { label: "África", countries: ["ZA", "EG", "MA", "NG", "KE", "GH", "TN", "AO", "MZ"] },
};

export function regionOf(countryCode: string | null | undefined): string | null {
  const cc = (countryCode ?? "").trim().toUpperCase();
  if (!cc) return null;
  return Object.entries(REGIONS).find(([, r]) => r.countries.includes(cc))?.[0] ?? null;
}

export function resolveDutiesRule(rules: DutiesRule[], countryCode: string | null | undefined): { rule: DutiesRule; source: "country" | "region" | "default" } | null {
  const active = rules.filter((r) => r.active);
  const cc = (countryCode ?? "").trim().toUpperCase();
  const country = cc ? active.find((r) => r.market_type === "country" && r.market.toUpperCase() === cc) : undefined;
  if (country) return { rule: country, source: "country" };
  const region = regionOf(cc);
  const byRegion = region ? active.find((r) => r.market_type === "region" && r.market === region) : undefined;
  if (byRegion) return { rule: byRegion, source: "region" };
  const fallback = active.find((r) => r.market_type === "default");
  return fallback ? { rule: fallback, source: "default" } : null;
}

export function dutiesDefaultAmount(rule: Pick<DutiesRule, "default_pct"> | null, merchandiseSubtotal: number): number | null {
  if (!rule || rule.default_pct === null || !(Number(rule.default_pct) > 0)) return null;
  return Math.round(merchandiseSubtotal * Number(rule.default_pct)) / 100;
}

/** Country code of an order's shipping address (supports both stored spellings). */
export function orderCountryCode(address: unknown): string | null {
  const a = (address ?? {}) as Record<string, unknown>;
  const raw = String(a.countryCode ?? a.country_code ?? a.country ?? "").trim();
  return raw ? raw.toUpperCase() : null;
}
