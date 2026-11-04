/**
 * Product name in the buyer's language (P34): EN → title_en, ES → title_es, PT → title (the master title).
 * A missing translation falls back to the master title, never to the other foreign language.
 */
export function localizedTitle(
  p: { title: string; titleEn?: string | null; titleEs?: string | null },
  locale: string
): string {
  const pick = locale === "en" ? p.titleEn : locale === "es" ? p.titleEs : null;
  return pick?.trim() || p.title;
}
