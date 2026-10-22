import localFont from "next/font/local";

/**
 * Fonts are bundled in src/fonts (latin subset, SIL OFL) instead of being
 * downloaded from Google at build time — a Google Fonts hiccup used to fail
 * the whole Vercel build.
 */
export const displayFont = localFont({
  variable: "--font-display",
  display: "swap",
  src: [
    { path: "../fonts/cormorant-garamond-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/cormorant-garamond-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/cormorant-garamond-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/cormorant-garamond-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  fallback: ["Georgia", "serif"],
});

export const bodyFont = localFont({
  variable: "--font-body",
  display: "swap",
  src: [
    { path: "../fonts/plus-jakarta-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/plus-jakarta-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/plus-jakarta-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  fallback: ["system-ui", "Arial", "sans-serif"],
});

export const adminFont = localFont({
  variable: "--font-body",
  display: "swap",
  src: [{ path: "../fonts/inter-latin-wght-normal.woff2", weight: "100 900", style: "normal" }],
  fallback: ["system-ui", "Arial", "sans-serif"],
});
