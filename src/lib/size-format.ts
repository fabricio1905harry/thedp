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

/** "88" → "34.6"; "86-90" → "33.9-35.4". Returns "" for non-numeric text. */
export function cmToIn(cm: string): string {
  const parts = cm.split(/\s*[-–]\s*/).map((p) => Number(p.replace(",", ".")));
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n))) return "";
  return parts.map((n) => (Math.round((n / 2.54) * 10) / 10).toString()).join("-");
}

/**
 * Buyer label (PDF pp. 44/55): letter / US size with the Brazilian size in
 * parentheses, in every language and currency.
 *   en / es:  M / US 6 (BR 40)      pt:  M / BR 40 (US 6)
 * The EU size is not shown: the PDF does not use it.
 */
export function formatSize(raw: string, info: SizeInfo | undefined, locale: string, _currency?: string): string {
  if (!info) return raw;
  const head = info.letter || (norm(raw) === norm(info.br) ? "" : raw);
  const join = (rest: string) => (head ? `${head} / ${rest}` : rest);
  if (locale === "pt") return join(info.us ? `BR ${info.br} (US ${info.us})` : `BR ${info.br}`);
  return join(info.us ? `US ${info.us} (BR ${info.br})` : `BR ${info.br}`);
}
