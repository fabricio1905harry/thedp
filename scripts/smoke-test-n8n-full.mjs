import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== Comprehensive n8n Integration Smoke Test ===");

const cdnUrls = [
  "https://cdn-op.vesti.mobi/p/107524/b52ab7f2-423f-4bee-80b7-8f5436ae173c/87799-og.webp",
  "https://cdn-op.vesti.mobi/p/107524/b52ab7f2-423f-4bee-80b7-8f5436ae173c/88510-og.webp",
  "https://cdn-op.vesti.mobi/p/107524/b52ab7f2-423f-4bee-80b7-8f5436ae173c/55542-og.webp",
  "https://cdn-op.vesti.mobi/p/107524/b52ab7f2-423f-4bee-80b7-8f5436ae173c/47793-og.webp"
];

// Test A: n8n writing to 'imagens' column (Portuguese)
const resA = await fetch(`${supabaseUrl}/rest/v1/products`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
    "Prefer": "return=representation",
  },
  body: JSON.stringify({
    slug: `smoke-n8n-pt-${Date.now()}`,
    title: "Smoke Test n8n PT imagens",
    status: "published",
    imagens: cdnUrls,
  }),
});
const dataA = await resA.json();
const idA = dataA[0]?.id;

const resImgsA = await fetch(`${supabaseUrl}/rest/v1/product_images?product_id=eq.${idA}&select=*`, {
  headers: { "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}` },
});
const imgsA = await resImgsA.json();
console.log(`Test A (n8n 'imagens' column): ${imgsA.length} images created in product_images`);

// Test B: n8n writing to 'images' column (English)
const resB = await fetch(`${supabaseUrl}/rest/v1/products`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
    "Prefer": "return=representation",
  },
  body: JSON.stringify({
    slug: `smoke-n8n-en-${Date.now()}`,
    title: "Smoke Test n8n EN images",
    status: "published",
    images: cdnUrls,
  }),
});
const dataB = await resB.json();
const idB = dataB[0]?.id;

const resImgsB = await fetch(`${supabaseUrl}/rest/v1/product_images?product_id=eq.${idB}&select=*`, {
  headers: { "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}` },
});
const imgsB = await resImgsB.json();
console.log(`Test B (n8n 'images' column): ${imgsB.length} images created in product_images`);

// Cleanup
await fetch(`${supabaseUrl}/rest/v1/products?id=in.(${idA},${idB})`, {
  method: "DELETE",
  headers: { "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}` },
});

if (imgsA.length === 4 && imgsB.length === 4) {
  console.log("\n🎉 ALL N8N SUPABASE NODE TESTS PASSED 100%!");
} else {
  console.error("\n❌ TEST FAILED!");
  process.exit(1);
}
