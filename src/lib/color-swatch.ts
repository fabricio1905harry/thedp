/**
 * Best-effort swatch color for common PT/EN/ES color names. Names are
 * normalized (case, accents, spaces) and compound names fall back to their
 * most specific word ("Azul Serenity" → serenity). Unmapped names get a
 * neutral gray-beige so the label still reads without a wrong hint.
 */
const SWATCH_HEX: Record<string, string> = {
  // neutrals
  preto: "#141312", black: "#141312", negro: "#141312",
  branco: "#ffffff", white: "#ffffff", blanco: "#ffffff",
  offwhite: "#f4efe4", gelo: "#f1f1ee", marfim: "#f3ecd8", ivory: "#f3ecd8", marfil: "#f3ecd8",
  creme: "#f3e9d2", cream: "#f3e9d2", crema: "#f3e9d2",
  nude: "#d9b99b", bege: "#d8cbb0", beige: "#d8cbb0",
  areia: "#d8c3a0", sand: "#d8c3a0", arena: "#d8c3a0",
  champagne: "#e8d5b5", camel: "#c19a6b",
  cinza: "#9a9691", gray: "#9a9691", grey: "#9a9691", gris: "#9a9691",
  grafite: "#4a4a4d", chumbo: "#5a5d63", prata: "#c7c7c7", silver: "#c7c7c7", plata: "#c7c7c7",
  dourado: "#c5a059", gold: "#c5a059", oro: "#c5a059", dorado: "#c5a059",
  cobre: "#b87333", copper: "#b87333", bronze: "#8c5a2b",
  // browns / earth
  marrom: "#6b4226", brown: "#6b4226", marron: "#6b4226",
  cacau: "#5b3a29", cocoa: "#5b3a29", cacao: "#5b3a29",
  chocolate: "#4b2e1e", cafe: "#5a3b28", coffee: "#5a3b28",
  caramelo: "#b5703a", caramel: "#b5703a",
  terracota: "#c1613f", terracotta: "#c1613f",
  telha: "#b6553a", ferrugem: "#a8442a", rust: "#a8442a", oxido: "#a8442a",
  // reds / pinks / oranges
  vermelho: "#a3271f", red: "#a3271f", rojo: "#a3271f",
  vinho: "#5c1a24", wine: "#5c1a24", vino: "#5c1a24", bordo: "#5c1a24", bordeaux: "#5c1a24", burgundy: "#5c1a24",
  marsala: "#955251", marsalla: "#955251",
  coral: "#ff6f59", salmao: "#f4978e", salmon: "#f4978e",
  goiaba: "#e8566c", fucsia: "#c2185b", fuchsia: "#c2185b", magenta: "#c2185b",
  rosa: "#e8a5c0", pink: "#e8a5c0", rose: "#e8a5c0", rosado: "#e8a5c0",
  chiclete: "#f27ab0", antigo: "#d9a0a8", blush: "#eec3c3", pessego: "#f8c4a4", peach: "#f8c4a4", durazno: "#f8c4a4",
  laranja: "#f08a24", orange: "#f08a24", naranja: "#f08a24",
  // yellows
  amarelo: "#f2d24b", yellow: "#f2d24b", amarillo: "#f2d24b",
  mostarda: "#d9a21b", mustard: "#d9a21b", mostaza: "#d9a21b",
  limao: "#d8e04b", lima: "#d8e04b", lime: "#d8e04b",
  // greens
  verde: "#2f6b4f", green: "#2f6b4f",
  oliva: "#6b7a3a", olive: "#6b7a3a", musgo: "#5b6b3a",
  menta: "#a8e0c4", mint: "#a8e0c4",
  esmeralda: "#1e7a5a", emerald: "#1e7a5a",
  militar: "#4b5320", bandeira: "#1f7a3f", petroleo: "#1f5a68",
  turquesa: "#2bb3b1", turquoise: "#2bb3b1", tiffany: "#81d8d0",
  // blues / purples
  azul: "#2451c4", blue: "#2451c4",
  royal: "#1f3fbf", azulroyal: "#1f3fbf",
  marinho: "#0f1f3d", navy: "#0f1f3d", marino: "#0f1f3d",
  serenity: "#92a8d1", celeste: "#9ec8e8", bebe: "#bcd7f0", jeans: "#4a6b9a", denim: "#4a6b9a",
  violeta: "#7a3fa0", violet: "#7a3fa0", roxo: "#6a2c91", purple: "#6a2c91", morado: "#6a2c91",
  lilas: "#b9a0d6", lilac: "#b9a0d6", lavanda: "#b7a6d9", lavender: "#b7a6d9", uva: "#5b2a6e",
};

export const SWATCH_FALLBACK = "#cfc9c0";

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function swatchHex(color: string): string {
  const n = norm(color).trim();
  const collapsed = n.replace(/[^a-z]/g, "");
  if (SWATCH_HEX[collapsed]) return SWATCH_HEX[collapsed];
  // compound ("azul serenity", "verde-oliva escuro"): most specific word first (last → first)
  const words = n.split(/[^a-z]+/).filter(Boolean).reverse();
  for (const w of words) {
    if (SWATCH_HEX[w]) return SWATCH_HEX[w];
  }
  // plural / suffix variants ("terracotas", "rosas")
  for (const w of words) {
    const base = w.replace(/s$/, "");
    if (SWATCH_HEX[base]) return SWATCH_HEX[base];
  }
  return SWATCH_FALLBACK;
}
