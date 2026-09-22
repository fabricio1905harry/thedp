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

console.log("=== Diagnóstico de Imagens dos Produtos ===");

const [{ data: products }, { data: images }] = await Promise.all([
  supabase.from("products").select("id, slug, title, source_url, images"),
  supabase.from("product_images").select("id, product_id, storage_path, position"),
]);

console.log(`Total de produtos no banco: ${products?.length ?? 0}`);
console.log(`Total de imagens em product_images: ${images?.length ?? 0}`);

const imagesByProd = new Map();
for (const img of images ?? []) {
  if (!imagesByProd.has(img.product_id)) imagesByProd.set(img.product_id, []);
  imagesByProd.get(img.product_id).push(img);
}

let missingCount = 0;

for (const p of products ?? []) {
  const prodImgs = imagesByProd.get(p.id) ?? [];
  console.log(`\nProduto [${p.slug}]:`);
  console.log(`  - Title: ${p.title}`);
  console.log(`  - Source URL: ${p.source_url || "(none)"}`);
  console.log(`  - Images JSON column: ${JSON.stringify(p.images || [])}`);
  console.log(`  - Registros em product_images: ${prodImgs.length}`);
  
  if (prodImgs.length === 0) {
    missingCount++;
    console.log(`  ❌ SEM IMAGENS EM product_images!`);
  } else {
    prodImgs.forEach((img) => console.log(`     -> ${img.storage_path}`));
  }
}

console.log(`\nProdutos sem imagens em product_images: ${missingCount} de ${products?.length ?? 0}`);
