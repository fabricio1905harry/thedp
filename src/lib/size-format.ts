/**
 * Size table (migration 0050, Admin → Tamanhos). Pure helpers, safe to import
 * from client components.
 */

export interface SizeChartRow {
  id: string;
  size_br: string;
  size_us: string | null;
  size_eu: string | null;
  letter: string | null;
  aliases: string[];
  bust_cm: string | null;
  waist_cm: string | null;
  hip_cm: string | null;
  note: string;
}

export interface SizeInfo {
  br: string;
  us: string | null;
  eu: string | null;
  letter: string | null;
}

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/** Finds the chart row for a size as the supplier wrote it (letter, BR number or alias). */
export function matchSize(chart: SizeChartRow[], raw: string): SizeChartRow | null {
  const k = norm(raw);
  if (!k) return null;
  return (
    chart.find((r) => norm(r.size_br) === k) ??
    chart.find((r) => norm(r.letter) === k) ??
    chart.find((r) => r.aliases.some((a) => norm(a) === k)) ??
    null
  );
}

export function toSizeInfo(row: SizeChartRow): SizeInfo {
  return { br: row.size_br, us: row.size_us, eu: row.size_eu, letter: row.letter };
}

/**
 * Buyer label without duplicated parentheses.
 * en / USD:  M / US 6 (BR 40)      es / EUR:  M / EU 40      pt:  M / BR 40 (US 6)
 */
export function formatSize(raw: string, info: SizeInfo | undefined, locale: string, currency: string): string {
  if (!info) return raw;
  const head = info.letter || (norm(raw) === norm(info.br) ? "" : raw);
  const join = (rest: string) => (head ? `${head} / ${rest}` : rest);
  if (currency === "EUR" || locale === "es") {
    return info.eu ? join(`EU ${info.eu}`) : head || raw;
  }
  if (locale === "pt" && currency !== "USD") {
    return join(info.us ? `BR ${info.br} (US ${info.us})` : `BR ${info.br}`);
  }
  return join(info.us ? `US ${info.us} (BR ${info.br})` : `BR ${info.br}`);
}
