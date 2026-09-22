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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

console.log("=== Test: Updating existing product images ===");

const cdnUrl1 = "https://cdn-op.vesti.mobi/p/107524/b52ab7f2-423f-4bee-80b7-8f5436ae173c/87799-og.webp";
const cdnUrl2 = "https://cdn-op.vesti.mobi/p/107524/b52ab7f2-423f-4bee-80b7-8f5436ae173c/87800-og.webp";

// 1. Create product initially WITHOUT images (images = [])
const { data: newProd } = await supabase
  .from("products")
  .insert({
    slug: `test-empty-first-${Date.now()}`,
    title: "VESTIDO TESTE EMPTY FIRST",
    category: "Vestidos",
  })
  .select("id, slug, images")
  .single();

console.log("1. Created product initially with images =", newProd?.images);

const { data: imgRows1 } = await supabase.from("product_images").select("id").eq("product_id", newProd.id);
console.log("   product_images count =", imgRows1?.length);

// 2. Update product with images array
console.log("\n2. Updating product with images array...");
const { data: updatedProd, error } = await supabase
  .from("products")
  .update({
    images: [cdnUrl1, cdnUrl2],
  })
  .eq("id", newProd.id)
  .select("id, images")
  .single();

if (error) {
  console.error("Error updating product:", error);
  process.exit(1);
}

console.log("   Updated product images column =", updatedProd?.images);

const { data: imgRows2 } = await supabase.from("product_images").select("id, storage_path, position").eq("product_id", newProd.id);
console.log("   product_images count after update =", imgRows2?.length);
console.log("   product_images rows =", imgRows2);

if (imgRows2?.length === 2) {
  console.log("\n✅ SUCCESS: Trigger automatically populated product_images when images was updated!");
} else {
  console.error("\n❌ FAILED!");
}

// Cleanup
await supabase.from("products").delete().eq("id", newProd.id);
