/**
 * UI text overrides: any string of the site (buttons, labels, notices…) can
 * be edited by the super admin per language (Admin → Textos da interface).
 * Overrides live in cms_blocks (scope "site", block "ui_texts") as
 * { "namespace.key": { en?, es?, pt? } } and are merged over the built-in
 * messages (src/messages/*.json) on every request.
 */

export type UiOverrides = Record<string, Partial<Record<"en" | "es" | "pt", string>>>;
type Messages = Record<string, unknown>;

export function flattenMessages(obj: Messages, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else if (v && typeof v === "object") Object.assign(out, flattenMessages(v as Messages, key));
  }
  return out;
}

export function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

/** An override must keep exactly the placeholders of the original and have no stray braces. */
export function validateOverride(base: string, value: string): string | null {
  const stripped = value.replace(/\{\w+\}/g, "");
  if (/[{}]/.test(stripped)) return "Chaves { } desbalanceadas — só são permitidos {marcadores}.";
  const a = placeholders(base).join(",");
  const b = placeholders(value).join(",");
  if (a !== b) return `Mantenha os marcadores exatamente como no original: ${placeholders(base).map((p) => `{${p}}`).join(" ") || "(nenhum)"}.`;
  return null;
}

/** Messages with the overrides of one locale applied (does not mutate the input). */
export function applyOverrides(base: Messages, overrides: UiOverrides, locale: "en" | "es" | "pt"): Messages {
  const result = structuredClone(base) as Messages;
  for (const [flatKey, perLocale] of Object.entries(overrides)) {
    const value = perLocale[locale];
    if (!value) continue;
    const path = flatKey.split(".");
    let node = result as Record<string, unknown>;
    for (let i = 0; i < path.length - 1; i++) {
      const next = node[path[i]];
      if (!next || typeof next !== "object") {
        node = null as unknown as Record<string, unknown>;
        break;
      }
      node = next as Record<string, unknown>;
    }
    if (node && typeof node[path[path.length - 1]] === "string") node[path[path.length - 1]] = value;
  }
  return result;
}
