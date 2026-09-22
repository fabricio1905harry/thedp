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

console.log("=== INSPEÇÃO DOS ÚLTIMOS PRODUTOS CRIADOS PELO N8N ===");

const res = await client.query(`
  select 
    p.id, 
    p.slug, 
    p.title, 
    p.images, 
    pg_typeof(p.images) as images_pg_type,
    jsonb_typeof(p.images) as images_jsonb_type,
    p.created_at,
    (select count(*) from product_images pi where pi.product_id = p.id) as count_product_images
  from products p
  order by p.created_at desc
  limit 10;
`);

console.log(`Últimos ${res.rows.length} produtos em order by created_at desc:`);

for (const r of res.rows) {
  console.log(`\n----------------------------------------`);
  console.log(`ID: ${r.id}`);
  console.log(`Created At: ${r.created_at}`);
  console.log(`Slug: ${r.slug}`);
  console.log(`Title: ${r.title}`);
  console.log(`images PG Type: ${r.images_pg_type}`);
  console.log(`images JSONB Type: ${r.images_jsonb_type}`);
  console.log(`images Raw Value:`, r.images);
  console.log(`images Stringified:`, JSON.stringify(r.images));
  console.log(`Qtd em product_images: ${r.count_product_images}`);

  const imgRows = await client.query(`
    select id, storage_path, position, hash 
    from product_images 
    where product_id = $1 
    order by position asc;
  `, [r.id]);

  console.log(`Linhas na tabela product_images (${imgRows.rows.length}):`);
  imgRows.rows.forEach((row) => console.log(`   [pos ${row.position}] ${row.storage_path}`));
}

await client.end();
