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

console.log("=== Testing CDN Image URL Ingestion (e.g. Vesti Mobi CDN) ===");

const cdnUrl = "https://cdn-op.vesti.mobi/p/107524/b52ab7f2-423f-4bee-80b7-8f5436ae173c/87799-og.webp";

// 1. Ingest product with CDN image URL
const res = await fetch("http://localhost:3005/api/ingest/product", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": env.SUPABASE_SERVICE_ROLE_KEY,
  },
  body: JSON.stringify({
    slug: "vestido-vesti-cdn-test",
    title: "VESTIDO VESTI CDN TEST",
    category: "Festas",
    original_price: 350.0,
    markup: 70.0,
    sizes: ["38", "40"],
    colors: ["Vermelho"],
    images: [cdnUrl],
    status: "published",
  }),
});

const json = await res.json();
if (!res.ok || !json.success) {
  console.error("Ingestion failed:", json);
  process.exit(1);
}

console.log("Product ingested successfully with CDN image URL:", json.product.slug);

// 2. Query product_images table to verify storage_path holds full CDN URL
const { data: imgRows, error: imgErr } = await admin
  .from("product_images")
  .select("id, product_id, storage_path, position")
  .eq("product_id", json.product.id);

if (imgErr || !imgRows || imgRows.length === 0) {
  console.error("Failed to query product_images for ingested product:", imgErr);
  process.exit(1);
}

console.log("Stored image row in product_images:");
console.log(" -> storage_path:", imgRows[0].storage_path);

if (imgRows[0].storage_path !== cdnUrl) {
  console.error(`EXPECTED ${cdnUrl} BUT GOT ${imgRows[0].storage_path}`);
  process.exit(1);
}

// Clean up test product
await admin.from("products").delete().eq("id", json.product.id);
console.log("=== CDN IMAGE INGESTION TEST PASSED 100%! ===");
