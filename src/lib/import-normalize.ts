/** Normalization of supplier (Vesti) products on import. */

/** "VESTIDO CAPA" → "Vestido capa": only the first letter in upper case (P42). */
export function sentenceCase(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return t;
  const lower = t.toLocaleLowerCase("pt-BR");
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
}

/** "96% poliéster 04% elastano" — a description that is only a fabric composition (P44). */
export function looksLikeComposition(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= 200 && /^\d{1,3}([.,]\d+)?\s*%\s*\p{L}/u.test(t) && !/[.!?]\s+\p{Lu}/u.test(t);
}

/** Default stock of each new size × color combination of an imported product (P43). */
export const IMPORT_DEFAULT_STOCK = 500;

