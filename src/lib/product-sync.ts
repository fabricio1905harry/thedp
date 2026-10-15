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
  title: "Title",
  title_en: "Title (EN)",
  title_es: "Title (ES)",
  description: "Description",
  category: "Category",
  brand: "Brand",
  original_price: "Source cost",
  markup: "Markup",
  hs_code: "HS code",
  weight_g: "Weight",
  dims_cm: "Dimensions",
  sizes: "Sizes",
  colors: "Colors",
};

export function isSyncableField(value: string): value is SyncableField {
  return (SYNCABLE_FIELDS as readonly string[]).includes(value);
}

function normalize(value: unknown): string {
  if (value === undefined || value === "" ) return "null";
  if (typeof value === "number") return String(Math.round(value * 100) / 100);
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return String(Math.round(Number(value) * 100) / 100);
  }
  return JSON.stringify(value ?? null);
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
