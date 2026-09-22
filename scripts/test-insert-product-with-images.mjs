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

console.log("=== Test: Inserting Product with images array ===");

const cdnUrl1 = "https://cdn-op.vesti.mobi/p/107524/b52ab7f2-423f-4bee-80b7-8f5436ae173c/87799-og.webp";
const cdnUrl2 = "https://cdn-op.vesti.mobi/p/107524/b52ab7f2-423f-4bee-80b7-8f5436ae173c/87800-og.webp";

const { data: newProd, error } = await supabase
  .from("products")
  .insert({
    slug: `test-vesti-mobi-${Date.now()}`,
    title: "VESTIDO TESTE VESTI MOBI",
    category: "Vestidos",
    images: [cdnUrl1, cdnUrl2],
  })
  .select("id, slug, images")
  .single();

if (error) {
  console.error("Error inserting product:", error);
  process.exit(1);
}

console.log("Product inserted successfully:", newProd);

const { data: imgRows } = await supabase
  .from("product_images")
  .select("id, storage_path, position")
  .eq("product_id", newProd.id);

console.log("Resulting rows in product_images:", imgRows);

if (imgRows?.length === 2 && imgRows[0].storage_path === cdnUrl1 && imgRows[1].storage_path === cdnUrl2) {
  console.log("\n✅ SUCCESS: Images array was automatically read and created in product_images!");
} else {
  console.error("\n❌ FAILED!");
}

// Cleanup
await supabase.from("products").delete().eq("id", newProd.id);
