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

console.log("=== Test: n8n Supabase Node writing to 'imagens' column ===");

const cdnUrl = "https://cdn-op.vesti.mobi/p/107524/b52ab7f2-423f-4bee-80b7-8f5436ae173c/87799-og.webp";

// Insert product setting "imagens" column (in Portuguese)
const payload = {
  slug: `n8n-test-imagens-col-${Date.now()}`,
  title: "VESTIDO TESTE COLUNA IMAGENS",
  category: "Vestidos",
  status: "published",
  imagens: [cdnUrl],
};

const res = await fetch(`${supabaseUrl}/rest/v1/products`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
    "Prefer": "return=representation",
  },
  body: JSON.stringify(payload),
});

const data = await res.json();
console.log("Inserted product via PostgREST:", data);

// Check product_images table
const resImgs = await fetch(`${supabaseUrl}/rest/v1/product_images?product_id=eq.${data[0]?.id}&select=*`, {
  headers: {
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
  },
});
const imgRows = await resImgs.json();
console.log("\nRows generated in product_images table:", imgRows);

if (imgRows?.length === 1 && imgRows[0].storage_path === cdnUrl) {
  console.log("\n✅ SUCCESS: Trigger automatically read from 'imagens' column and created product_images row!");
} else {
  console.error("\n❌ FAILED!");
}

// Cleanup
await fetch(`${supabaseUrl}/rest/v1/products?id=eq.${data[0]?.id}`, {
  method: "DELETE",
  headers: {
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
  },
});
