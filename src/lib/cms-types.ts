/**
 * Site CMS model. Every editable block (Home module, About/Contact section)
 * is declared in cms-blocks.ts with its fields and DEFAULT content; the
 * database (cms_blocks) only stores what the TDP changed in the Admin:
 * ON/OFF, order, visibility by operation and the content itself.
 *
 * Text content: English is the master; Spanish and Portuguese are stored
 * next to it and can be edited by hand, so a bad translation never needs a
 * developer. A missing translation falls back to English.
 */

export const CMS_LOCALES = ["en", "es", "pt"] as const;
export type CmsLocale = (typeof CMS_LOCALES)[number];
export type Localized = Partial<Record<CmsLocale, string>>;

export type CmsScope = "home" | "about" | "contact" | "site" | "pages";

/** Operations / domains (same codes as sales_channels). */
export const OPERATIONS = [
  { code: "intl_b2b", label: "International B2B" },
  { code: "intl_b2c", label: "International DTC" },
  { code: "br_b2b", label: "National B2B" },
  { code: "br_b2c", label: "National DTC" },
] as const;
export type OperationCode = (typeof OPERATIONS)[number]["code"];

export type FieldKind = "text" | "textarea" | "url" | "image" | "number" | "boolean" | "select" | "slugs" | "list";

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  /** EN/ES/PT versions (text and textarea only). */
  translatable?: boolean;
  options?: { value: string; label: string }[];
  /** list: the fields of each item. */
  itemFields?: FieldDef[];
  itemLabel?: string;
  hint?: string;
}

export interface BlockDef {
  scope: CmsScope;
  key: string;
  label: string;
  description?: string;
  fields: FieldDef[];
  defaults: Record<string, unknown>;
  defaultActive: boolean;
  defaultSort: number;
  defaultOperations: OperationCode[];
  /** Paid commercial placement (partner + start/end dates). */
  placement?: boolean;
}

export const ALL_OPERATIONS: OperationCode[] = ["intl_b2b", "intl_b2c", "br_b2b", "br_b2c"];

/** Which operation a site deployment/domain serves (until per-domain config exists). */
export function operationForSiteMode(mode: string | null | undefined): OperationCode {
  return mode === "nacional" ? "br_b2b" : "intl_b2b";
}

export function isLocalized(value: unknown): value is Localized {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** EN/ES/PT value → string for a locale, falling back to the English master. */
export function pickLocale(value: unknown, locale: string): string {
  if (typeof value === "string") return value;
  if (!isLocalized(value)) return "";
  const loc = (CMS_LOCALES as readonly string[]).includes(locale) ? (locale as CmsLocale) : "en";
  return value[loc] || value.en || "";
}

/**
 * Defaults ← overrides. A key present in the override wins; for translatable
 * text each language is merged on its own so one edited language does not
 * discard the default of the others.
 */
export function mergeContent(
  fields: FieldDef[],
  defaults: Record<string, unknown>,
  override: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...defaults };
  if (!override) return out;
  for (const field of fields) {
    const o = override[field.key];
    if (o === undefined) continue;
    if (field.translatable && isLocalized(o) && isLocalized(defaults[field.key])) {
      out[field.key] = { ...(defaults[field.key] as Localized), ...o };
    } else {
      out[field.key] = o;
    }
  }
  return out;
}

/** Content with every translatable field resolved to one locale (lists included). */
export function resolveContent(fields: FieldDef[], content: Record<string, unknown>, locale: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = content[field.key];
    if (field.kind === "list") {
      const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
      out[field.key] = items.map((item) => resolveContent(field.itemFields ?? [], item, locale));
    } else if (field.translatable) {
      out[field.key] = pickLocale(value, locale);
    } else {
      out[field.key] = value;
    }
  }
  return out;
}
