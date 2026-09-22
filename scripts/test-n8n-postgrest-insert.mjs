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

console.log("=== Test: Simulating n8n Supabase Node PostgREST HTTP Request ===");

const cdnUrls = [
  "https://cdn-op.vesti.mobi/p/107524/b52ab7f2-423f-4bee-80b7-8f5436ae173c/87799-og.webp",
  "https://cdn-op.vesti.mobi/p/107524/b52ab7f2-423f-4bee-80b7-8f5436ae173c/88510-og.webp"
];

// 1. Test POST /rest/v1/products sending images as a JS Array (how n8n sends arrays)
const payload1 = {
  slug: `n8n-sim-array-${Date.now()}`,
  title: "VESTIDO N8N SIMULADO ARRAY",
  category: "Vestidos",
  status: "published",
  images: cdnUrls,
};

console.log("\n1. Sending POST /rest/v1/products with JS Array payload:", payload1);

const res1 = await fetch(`${supabaseUrl}/rest/v1/products`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
    "Prefer": "return=representation",
  },
  body: JSON.stringify(payload1),
});

const data1 = await res1.json();
console.log("Response 1 status:", res1.status);
console.log("Response 1 data:", data1);

// Query product_images for created product
const resImgs1 = await fetch(`${supabaseUrl}/rest/v1/product_images?product_id=eq.${data1[0]?.id}&select=*`, {
  headers: {
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
  },
});
const imgs1 = await resImgs1.json();
console.log("product_images generated for Test 1:", imgs1);

// 2. Test POST /rest/v1/products sending images as a Stringified JSON string (how n8n sends stringified json)
const payload2 = {
  slug: `n8n-sim-str-${Date.now()}`,
  title: "VESTIDO N8N SIMULADO STR",
  category: "Vestidos",
  status: "published",
  images: JSON.stringify(cdnUrls),
};

console.log("\n2. Sending POST /rest/v1/products with Stringified JSON payload:", payload2);

const res2 = await fetch(`${supabaseUrl}/rest/v1/products`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
    "Prefer": "return=representation",
  },
  body: JSON.stringify(payload2),
});

const data2 = await res2.json();
console.log("Response 2 status:", res2.status);
console.log("Response 2 data:", data2);

const resImgs2 = await fetch(`${supabaseUrl}/rest/v1/product_images?product_id=eq.${data2[0]?.id}&select=*`, {
  headers: {
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
  },
});
const imgs2 = await resImgs2.json();
console.log("product_images generated for Test 2:", imgs2);

// Cleanup test products
await fetch(`${supabaseUrl}/rest/v1/products?id=in.(${data1[0]?.id},${data2[0]?.id})`, {
  method: "DELETE",
  headers: {
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
  },
});

console.log("\n=== N8N SIMULATION COMPLETED ===");
