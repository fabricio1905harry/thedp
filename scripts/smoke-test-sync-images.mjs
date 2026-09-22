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

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log("=== Smoke Test: Auto Sync Product Images ===");

const testSlug = `test-sync-dress-${Date.now()}`;
const img1 = "https://cdn-op.vesti.mobi/p/107524/test-auto-sync-1.webp";
const img2 = "https://cdn-op.vesti.mobi/p/107524/test-auto-sync-2.webp";
const img3 = "https://cdn-op.vesti.mobi/p/107524/test-auto-sync-3.webp";

// 1. Insert product with 2 images
const { data: newProd, error: errInsert } = await supabase
  .from("products")
  .insert({
    slug: testSlug,
    title: "Vestido Teste Auto Sync",
    category: "Vestidos",
    images: [img1, img2],
  })
  .select("id, slug")
  .single();

if (errInsert || !newProd) {
  console.error("Failed to insert test product:", errInsert);
  process.exit(1);
}

console.log("Inserted product:", newProd.id);

// Check product_images table
const { data: initialImgs } = await supabase
  .from("product_images")
  .select("id, storage_path")
  .eq("product_id", newProd.id);

console.log("Initial product_images count:", initialImgs?.length);
if (initialImgs?.length !== 2) {
  console.error("FAILED: Expected 2 product_images inserted automatically");
  process.exit(1);
}

// 2. Update product with SAME images -> verify NO duplicates created
await supabase
  .from("products")
  .update({ images: [img1, img2] })
  .eq("id", newProd.id);

const { data: duplicateCheckImgs } = await supabase
  .from("product_images")
  .select("id, storage_path")
  .eq("product_id", newProd.id);

console.log("Count after re-update with same images:", duplicateCheckImgs?.length);
if (duplicateCheckImgs?.length !== 2) {
  console.error("FAILED: Duplicates created!");
  process.exit(1);
}

// 3. Update product adding 3rd image -> verify ONLY 3rd image is added (total 3)
await supabase
  .from("products")
  .update({ images: [img1, img2, img3] })
  .eq("id", newProd.id);

const { data: updatedImgs } = await supabase
  .from("product_images")
  .select("id, storage_path")
  .eq("product_id", newProd.id);

console.log("Count after adding 3rd image:", updatedImgs?.length);
if (updatedImgs?.length !== 3) {
  console.error("FAILED: Expected exactly 3 images after adding 1 new image");
  process.exit(1);
}

// Cleanup
await supabase.from("products").delete().eq("id", newProd.id);
console.log("\n=== ALL AUTO SYNC PRODUCT IMAGES TESTS PASSED 100%! ===");
