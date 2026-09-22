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

console.log("=== Testing Product Images Integration ===");

// 1. Fetch images from product_images table
const { data: images, error: imgErr } = await admin
  .from("product_images")
  .select("id, product_id, storage_path, position, hash, products(slug, title)");

if (imgErr || !images || images.length === 0) {
  console.error("FAILED to query product_images:", imgErr);
  process.exit(1);
}

console.log(`Found ${images.length} images in product_images table:`);
for (const img of images) {
  console.log(` - Product: ${img.products?.title} | storage_path: ${img.storage_path}`);
}

console.log("=== ALL PRODUCT IMAGES CHECKS PASSED! ===");
