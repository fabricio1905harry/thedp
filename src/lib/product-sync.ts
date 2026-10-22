/**
 * Field-level sync protection.
 *
 * Every product column a supplier sync can write is listed here. When the
 * TDP edits one of them by hand it is added to products.locked_fields and
 * the ingest endpoint stops overwriting it; the rest keeps syncing. The
 * last value the supplier sent is always kept in products.source_snapshot
 * so "Reset to source" can restore it.
 */
export const SYNCABLE_FIELDS = [
  "title",
  "title_en",
  "title_es",
  "description",
  "category",
  "brand",
  "original_price",
  "markup",
  "hs_code",
  "weight_g",
  "dims_cm",
  "sizes",
  "colors",
] as const;

export type SyncableField = (typeof SYNCABLE_FIELDS)[number];

export const SYNCABLE_FIELD_LABELS: Record<SyncableField, string> = {
  title: "Título",
  title_en: "Título (EN)",
  title_es: "Título (ES)",
  description: "Descrição",
  category: "Categoria",
  brand: "Marca",
  original_price: "Custo do fornecedor",
  markup: "Markup",
  hs_code: "HS code",
  weight_g: "Peso",
  dims_cm: "Dimensões",
  sizes: "Tamanhos",
  colors: "Cores",
};

export function isSyncableField(value: string): value is SyncableField {
  return (SYNCABLE_FIELDS as readonly string[]).includes(value);
}

/** Canonical form so "empty" is always the same thing: null / undefined / "" / NaN / {} / [] / all-empty objects. */
function canonical(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  if (typeof value === "string") {
    const t = value.trim();
    if (t === "") return null;
    return Number.isNaN(Number(t)) ? t : Math.round(Number(t) * 100) / 100;
  }
  if (Array.isArray(value)) {
    const items = value.map(canonical).filter((v) => v !== null);
    return items.length === 0 ? null : items;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => [k, canonical(v)] as const)
      .filter(([, v]) => v !== null)
      .sort(([a], [b]) => a.localeCompare(b));
    return entries.length === 0 ? null : Object.fromEntries(entries);
  }
  return value;
}

function normalize(value: unknown): string {
  return JSON.stringify(canonical(value));
}

/** Fields whose value differs between the current row and the edit. */
export function changedFields(
  current: Partial<Record<SyncableField, unknown>>,
  next: Partial<Record<SyncableField, unknown>>
): SyncableField[] {
  return SYNCABLE_FIELDS.filter(
    (field) => field in next && normalize(current[field]) !== normalize(next[field])
  );
}

/** Supplier values minus the fields the TDP has locked. */
export function applyLocks(
  sourceValues: Partial<Record<SyncableField, unknown>>,
  lockedFields: readonly string[]
): Partial<Record<SyncableField, unknown>> {
  const locked = new Set(lockedFields);
  return Object.fromEntries(
    Object.entries(sourceValues).filter(([field]) => !locked.has(field))
  ) as Partial<Record<SyncableField, unknown>>;
}
