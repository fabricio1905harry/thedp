import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  readFileSync(path.join(rootDir, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("=== Testing International Size Conversion (BR / US / EU) ===");

const testSlug = "vestido-teste-tamanhos-internacionais";
const payload = {
  slug: testSlug,
  title: "Vestido Teste Tamanhos Internacionais",
  original_price: 400.0,
  markup: 80.0,
  sizes: ["36", "38", "40", "42", "44"],
  colors: ["Marsala", "Preto"],
  default_stock: 5,
  status: "published",
};

const { data: prod, error: prodErr } = await admin
  .from("products")
  .upsert(payload, { onConflict: "slug" })
  .select("id, slug, sizes, sizes_us, sizes_eu")
  .single();

if (prodErr || !prod) {
  console.error("FAILED to upsert product:", prodErr);
  process.exit(1);
}

console.log("Product sizes created:", {
  sizes_br: prod.sizes,
  sizes_us: prod.sizes_us,
  sizes_eu: prod.sizes_eu,
});

if (!prod.sizes_us || !prod.sizes_eu || prod.sizes_us.length !== 5) {
  console.error("ERROR: sizes_us or sizes_eu not generated properly on product.");
  process.exit(1);
}

// Check variants table for size_br, size_us, size_eu
const { data: variants, error: varErr } = await admin
  .from("variants")
  .select("id, size, size_br, size_us, size_eu, color, sku")
  .eq("product_id", prod.id);

if (varErr || !variants || variants.length === 0) {
  console.error("FAILED to retrieve variants:", varErr);
  process.exit(1);
}

console.log(`Generated ${variants.length} variants. Sample variant:`, variants[0]);

const v38 = variants.find((v) => v.size === "38");
if (!v38 || v38.size_br !== "38" || v38.size_us !== "4 (S)" || v38.size_eu !== "38") {
  console.error("ERROR: Variant size conversion mismatch for size 38:", v38);
  process.exit(1);
}

const v40 = variants.find((v) => v.size === "40");
if (!v40 || v40.size_br !== "40" || v40.size_us !== "6 (M)" || v40.size_eu !== "40") {
  console.error("ERROR: Variant size conversion mismatch for size 40:", v40);
  process.exit(1);
}

console.log("=== ALL INTERNATIONAL SIZE CONVERSION TESTS PASSED! ===");
