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

console.log("=== Smoke Test: Robust Auto Sync Product Images across all Formats ===");

// Test 1: Standard JSONB Array
const slug1 = `test-robust-1-${Date.now()}`;
const { data: p1 } = await supabase
  .from("products")
  .insert({
    slug: slug1,
    title: "Teste Robust 1",
    category: "Vestidos",
    images: ["https://cdn-op.vesti.mobi/p/r1.jpg", "https://cdn-op.vesti.mobi/p/r2.jpg"],
  })
  .select("id")
  .single();

const { data: imgs1 } = await supabase.from("product_images").select("storage_path").eq("product_id", p1.id);
console.log("Format 1 (JSONB Array):", imgs1?.length, "images");
if (imgs1?.length !== 2) {
  console.error("FAILED Format 1");
  process.exit(1);
}

// Test 2: Stringified JSON Array
const slug2 = `test-robust-2-${Date.now()}`;
const { data: p2 } = await supabase
  .from("products")
  .insert({
    slug: slug2,
    title: "Teste Robust 2",
    category: "Vestidos",
    images: '["https://cdn-op.vesti.mobi/p/r3.jpg", "https://cdn-op.vesti.mobi/p/r4.jpg"]',
  })
  .select("id")
  .single();

const { data: imgs2 } = await supabase.from("product_images").select("storage_path").eq("product_id", p2.id);
console.log("Format 2 (Stringified JSON):", imgs2?.length, "images");
if (imgs2?.length !== 2) {
  console.error("FAILED Format 2");
  process.exit(1);
}

// Test 3: Single String URL
const slug3 = `test-robust-3-${Date.now()}`;
const { data: p3 } = await supabase
  .from("products")
  .insert({
    slug: slug3,
    title: "Teste Robust 3",
    category: "Vestidos",
    images: "https://cdn-op.vesti.mobi/p/r5.jpg",
  })
  .select("id")
  .single();

const { data: imgs3 } = await supabase.from("product_images").select("storage_path").eq("product_id", p3.id);
console.log("Format 3 (Single String URL):", imgs3?.length, "images");
if (imgs3?.length !== 1) {
  console.error("FAILED Format 3");
  process.exit(1);
}

// Test 4: source_url fallback
const slug4 = `test-robust-4-${Date.now()}`;
const { data: p4 } = await supabase
  .from("products")
  .insert({
    slug: slug4,
    title: "Teste Robust 4",
    category: "Vestidos",
    source_url: "https://cdn-op.vesti.mobi/p/r6.jpg",
  })
  .select("id")
  .single();

const { data: imgs4 } = await supabase.from("product_images").select("storage_path").eq("product_id", p4.id);
console.log("Format 4 (source_url fallback):", imgs4?.length, "images");
if (imgs4?.length !== 1) {
  console.error("FAILED Format 4");
  process.exit(1);
}

// Cleanup test products
await supabase.from("products").delete().in("id", [p1.id, p2.id, p3.id, p4.id]);
console.log("\n=== ALL ROBUST PRODUCT IMAGE SYNC TESTS PASSED 100%! ===");
