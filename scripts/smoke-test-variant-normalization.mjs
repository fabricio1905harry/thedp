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

console.log("=== Smoke Test: Variant Normalization & 4-Column Pricing ===");

const testSlug = `smoke-test-norm-${Date.now()}`;
console.log(`1. Ingesting test product: slug=${testSlug}`);

// Insert product with sizes & colors as JSON arrays (supplier parsed)
const { data: product, error: insertErr } = await admin
  .from("products")
  .insert({
    slug: testSlug,
    title: "Vestido Teste Normalização",
    category: "Festa",
    original_price: 419.00,
    markup: 81.00,
    sizes: ["38", "40", "42", "44"],
    colors: ["Marsala", "Azul Marinho", "Verde"],
    default_stock: 5,
    status: "published",
  })
  .select()
  .single();

if (insertErr) throw new Error(`Insert failed: ${insertErr.message}`);

console.log(`   OK — Product created (id=${product.id})`);
console.log(`   sizes: ${JSON.stringify(product.sizes)}`);
console.log(`   colors: ${JSON.stringify(product.colors)}`);
console.log(`   price_brl: ${product.price_brl} (expect 500.00)`);

if (Number(product.price_brl) !== 500) {
  throw new Error(`price_brl mismatch: got ${product.price_brl}, expected 500.00`);
}

console.log("2. Verifying generated variants matrix (4 sizes x 3 colors = 12 variants)");
const { data: variants, error: varErr } = await admin
  .from("variants")
  .select("id, size, color, sku, stock")
  .eq("product_id", product.id);

if (varErr) throw new Error(`Fetch variants failed: ${varErr.message}`);

console.log(`   Variants generated: ${variants.length} (expect 12)`);
if (variants.length !== 12) {
  throw new Error(`Expected 12 variants, got ${variants.length}`);
}

const sampleSku = variants[0].sku;
console.log(`   Sample SKU: ${sampleSku}`);

console.log("3. Re-importing product (simulating sync update) to check ON CONFLICT non-duplication");
const { error: updateErr } = await admin
  .from("products")
  .update({
    original_price: 450.00,
    sizes: ["38", "40", "42", "44"],
    colors: ["Marsala", "Azul Marinho", "Verde"],
    updated_at: new Date().toISOString(),
  })
  .eq("id", product.id);

if (updateErr) throw new Error(`Update failed: ${updateErr.message}`);

const { data: reimportVariants } = await admin
  .from("variants")
  .select("id")
  .eq("product_id", product.id);

console.log(`   Variants after re-import: ${reimportVariants.length} (expect 12)`);
if (reimportVariants.length !== 12) {
  throw new Error(`Re-import created duplicate variants! Count is ${reimportVariants.length}`);
}

const { data: updatedProduct } = await admin
  .from("products")
  .select("price_brl")
  .eq("id", product.id)
  .single();

console.log(`   price_brl after price change: ${updatedProduct.price_brl} (expect 531.00)`);
if (Number(updatedProduct.price_brl) !== 531) {
  throw new Error(`price_brl did not recompute correctly: got ${updatedProduct.price_brl}`);
}

console.log("4. Testing exchange rate update in fx_rates and 4-column price recalculation");
const { error: fxErr } = await admin
  .from("fx_rates")
  .insert({ base: "BRL", quote: "USD", rate: 5.0, updated_by: null });

if (fxErr) throw new Error(`Insert fx_rates failed: ${fxErr.message}`);

const { data: fxProduct } = await admin
  .from("products")
  .select("price_brl, price_usd")
  .eq("id", product.id)
  .single();

console.log(`   price_usd after rate=5.0: ${fxProduct.price_usd} (expect 106.20)`);
if (Number(fxProduct.price_usd) !== 106.2) {
  throw new Error(`price_usd trigger failed: got ${fxProduct.price_usd}, expected 106.20`);
}

console.log("5. Cleaning up test data");
await admin.from("products").delete().eq("id", product.id);
await admin.from("fx_rates").delete().eq("rate", 5.0).eq("quote", "USD");

console.log("\nALL CHECKS PASSED SUCCESSFULLY!");
