import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

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

const databaseUrl = env.SUPABASE_DB_URL;
if (!databaseUrl) {
  console.error("Missing database URL");
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

console.log("=== EXECUTANDO MANUAL RE-SYNC DE TODOS OS PRODUTOS NO BANCO ===");

// Force trigger re-execution on all products by touching updated_at
const res = await client.query(`
  update products
  set updated_at = now()
  where images is not null and images <> '[]'::jsonb;
`);

console.log(`Produtos com imagens re-processados via trigger: ${res.rowCount}`);

// Inspect resulting product_images table
const check = await client.query(`
  select p.id, p.slug, p.title, p.images, count(pi.id) as count_images
  from products p
  left join product_images pi on pi.product_id = p.id
  group by p.id, p.slug, p.title, p.images;
`);

console.log("\nStatus pós-sincronização:");
for (const r of check.rows) {
  console.log(`- Produto [${r.slug}]: ${r.count_images} imagens em product_images (images column: ${JSON.stringify(r.images)})`);
}

await client.end();
