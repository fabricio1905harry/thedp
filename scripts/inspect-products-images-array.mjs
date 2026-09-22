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

console.log("=== Inspecionando coluna 'images' da tabela products ===");

const { data: prods } = await supabase.from("products").select("id, slug, title, images");

for (const p of prods ?? []) {
  console.log(`\nProduto [${p.slug}]:`);
  console.log(`  - Title: ${p.title}`);
  console.log(`  - Array 'images':`, p.images);

  const { data: imgRows } = await supabase
    .from("product_images")
    .select("id, storage_path, position")
    .eq("product_id", p.id);

  console.log(`  - Registros na tabela product_images (${imgRows?.length}):`);
  imgRows?.forEach((r) => console.log(`     [pos ${r.position}] -> ${r.storage_path}`));
}
