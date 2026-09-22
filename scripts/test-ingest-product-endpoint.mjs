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

console.log("=== Test Ingest Product Endpoint ===");

const cdnUrl1 = "https://cdn-op.vesti.mobi/p/107524/b52ab7f2-423f-4bee-80b7-8f5436ae173c/87799-og.webp";
const cdnUrl2 = "https://cdn-op.vesti.mobi/p/107524/b52ab7f2-423f-4bee-80b7-8f5436ae173c/87800-og.webp";

// Test sending payload with field "fotos" (common n8n/Vesti field name)
const res = await fetch("http://localhost:3005/api/ingest/product", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": env.SUPABASE_SERVICE_ROLE_KEY,
  },
  body: JSON.stringify({
    title: "Vestido Teste Ingestão Fotos",
    slug: `vestido-ingest-fotos-${Date.now()}`,
    original_price: 350.0,
    markup: 70.0,
    category: "Vestidos",
    fotos: [cdnUrl1, cdnUrl2],
  }),
});

const json = await res.json();
console.log("Response status:", res.status);
console.log("Response json:", json);

if (json.success && json.imagesSaved === 2) {
  console.log("✅ Ingestion API test passed!");

  // Verify in Supabase
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: prod } = await supabase.from("products").select("id, slug, images").eq("id", json.product.id).single();
  const { data: imgRows } = await supabase.from("product_images").select("storage_path, position").eq("product_id", json.product.id);

  console.log("Product images column in DB:", prod?.images);
  console.log("Product images table rows in DB:", imgRows);

  // Cleanup
  await supabase.from("products").delete().eq("id", json.product.id);
} else {
  console.error("❌ Ingestion API test failed");
}
