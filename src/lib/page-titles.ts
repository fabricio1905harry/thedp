/** Institutional pages added in the 24/10 homologation: URL slug → CMS page key + default title per language. */
export const EXTRA_PAGES: Record<string, { pageKey: string; title: { en: string; es: string; pt: string } }> = {
  "frete-e-impostos": {
    pageKey: "shipping_duties",
    title: { en: "Shipping & duties", es: "Envío e impuestos", pt: "Frete e impostos" },
  },
  "termos-de-atacado": {
    pageKey: "wholesale_terms",
    title: { en: "Wholesale terms", es: "Términos mayoristas", pt: "Termos de atacado" },
  },
  "termos-de-reserva": {
    pageKey: "reserve_terms",
    title: { en: "Reserve for later delivery — terms", es: "Reserva para entrega posterior — términos", pt: "Reserva para entrega futura — termos" },
  },
  incoterms: {
    pageKey: "incoterms",
    title: { en: "Incoterms & duties responsibility", es: "Incoterms y responsabilidad de impuestos", pt: "Incoterms e responsabilidade por impostos" },
  },
};

export const pageTitle = (title: { en: string; es: string; pt: string }, locale: string) =>
  title[(["en", "es", "pt"].includes(locale) ? locale : "en") as "en" | "es" | "pt"];
