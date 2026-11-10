/** Become a Brand form options (P35, PDF p. 83). Values are stored; labels are per language. */
export const BRAND_PRODUCT_CATEGORIES = ["dresses", "tops", "skirts", "pants", "jumpsuits", "sets", "resort", "accessories"] as const;
export const BRAND_OPPORTUNITY_TYPES = ["international_distribution", "national_distribution", "wholesale_b2b", "commercial_placement", "other"] as const;

/** Admin labels (pt-BR). */
export const BRAND_CATEGORY_LABEL_PT: Record<string, string> = {
  dresses: "Vestidos",
  tops: "Blusas e tops",
  skirts: "Saias",
  pants: "Calças",
  jumpsuits: "Macacões",
  sets: "Conjuntos",
  resort: "Resort",
  accessories: "Acessórios",
};
export const BRAND_OPPORTUNITY_LABEL_PT: Record<string, string> = {
  international_distribution: "Distribuição internacional",
  national_distribution: "Distribuição nacional",
  wholesale_b2b: "Atacado / B2B",
  commercial_placement: "Placement comercial / Parceria de marca",
  other: "Outro",
};
