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

console.log("=== Smoke Test: Full Sync Create & Delete Product Images ===");

const testSlug = `test-full-sync-${Date.now()}`;
const imgA = "https://cdn-op.vesti.mobi/p/test-A.jpg";
const imgB = "https://cdn-op.vesti.mobi/p/test-B.jpg";
const imgC = "https://cdn-op.vesti.mobi/p/test-C.jpg";
const imgD = "https://cdn-op.vesti.mobi/p/test-D.jpg";

// 1. CREATE product with [imgA, imgB, imgC]
const { data: prod, error: errInsert } = await supabase
  .from("products")
  .insert({
    slug: testSlug,
    title: "Produto Teste Full Sync",
    category: "Vestidos",
    images: [imgA, imgB, imgC],
  })
  .select("id")
  .single();

if (errInsert || !prod) {
  console.error("Failed to insert product:", errInsert);
  process.exit(1);
}

const { data: imgs1 } = await supabase
  .from("product_images")
  .select("storage_path, position")
  .eq("product_id", prod.id)
  .order("position", { ascending: true });

console.log("\n1. CREATE [imgA, imgB, imgC]:", imgs1?.length, "images created");
if (imgs1?.length !== 3 || imgs1[0].storage_path !== imgA || imgs1[2].storage_path !== imgC) {
  console.error("FAILED Step 1");
  process.exit(1);
}

// 2. EDIT / ADD imgD -> [imgA, imgB, imgC, imgD]
await supabase.from("products").update({ images: [imgA, imgB, imgC, imgD] }).eq("id", prod.id);

const { data: imgs2 } = await supabase
  .from("product_images")
  .select("storage_path, position")
  .eq("product_id", prod.id)
  .order("position", { ascending: true });

console.log("2. EDIT / ADD imgD:", imgs2?.length, "images");
if (imgs2?.length !== 4 || imgs2[3].storage_path !== imgD) {
  console.error("FAILED Step 2");
  process.exit(1);
}

// 3. EDIT / DELETE imgB -> [imgA, imgC, imgD] (imgB removed!)
await supabase.from("products").update({ images: [imgA, imgC, imgD] }).eq("id", prod.id);

const { data: imgs3 } = await supabase
  .from("product_images")
  .select("storage_path, position")
  .eq("product_id", prod.id)
  .order("position", { ascending: true });

console.log("3. EDIT / DELETE imgB:", imgs3?.length, "images remaining");
const paths3 = imgs3?.map((r) => r.storage_path);
console.log("   Current images in product_images:", paths3);
if (imgs3?.length !== 3 || paths3.includes(imgB)) {
  console.error("FAILED Step 3: imgB was NOT deleted!");
  process.exit(1);
}

// 4. EDIT / REORDER -> [imgD, imgA, imgC]
await supabase.from("products").update({ images: [imgD, imgA, imgC] }).eq("id", prod.id);

const { data: imgs4 } = await supabase
  .from("product_images")
  .select("storage_path, position")
  .eq("product_id", prod.id)
  .order("position", { ascending: true });

console.log("4. EDIT / REORDER [imgD, imgA, imgC]:");
imgs4?.forEach((r) => console.log(`   pos ${r.position} -> ${r.storage_path}`));
if (imgs4[0].storage_path !== imgD || imgs4[0].position !== 0 || imgs4[1].storage_path !== imgA || imgs4[1].position !== 1) {
  console.error("FAILED Step 4: Reordering failed!");
  process.exit(1);
}

// 5. EDIT / CLEAR -> []
await supabase.from("products").update({ images: [] }).eq("id", prod.id);

const { data: imgs5 } = await supabase
  .from("product_images")
  .select("id")
  .eq("product_id", prod.id);

console.log("5. EDIT / CLEAR ALL:", imgs5?.length, "images");
if (imgs5?.length !== 0) {
  console.error("FAILED Step 5: Images were not cleared!");
  process.exit(1);
}

// Cleanup
await supabase.from("products").delete().eq("id", prod.id);
console.log("\n=== ALL FULL IMAGE SYNC TESTS PASSED 100%! ===");
