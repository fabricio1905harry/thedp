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

console.log("=== EXECUTANDO FORCED SYNC EM TODOS OS PRODUTOS EXISTENTES NO BANCO ===");

// 1. Manually run insertion for any products that have non-empty images array
const res = await client.query(`
  insert into product_images (product_id, storage_path, hash, position)
  select
    p.id,
    trim(elem),
    md5(p.id::text || '_' || trim(elem)),
    (row_number() over (partition by p.id)) - 1
  from products p,
  lateral jsonb_array_elements_text(
    case 
      when jsonb_typeof(p.images) = 'array' then p.images
      when jsonb_typeof(p.images) = 'string' and (p.images #>> '{}') like '[%' then (p.images #>> '{}')::jsonb
      else '[]'::jsonb
    end
  ) as elem
  where trim(elem) <> ''
    and not exists (
      select 1 from product_images pi
      where pi.product_id = p.id
        and pi.storage_path = trim(elem)
    );
`);

console.log(`Linhas inseridas em product_images: ${res.rowCount}`);

// 2. Check total products and total product_images
const summary = await client.query(`
  select 
    p.slug, 
    p.title, 
    p.images, 
    count(pi.id) as total_images
  from products p
  left join product_images pi on pi.product_id = p.id
  group by p.id, p.slug, p.title, p.images;
`);

console.log("\nResumo do banco de dados:");
summary.rows.forEach((r) => {
  console.log(`- Produto [${r.slug}]: ${r.total_images} imagens em product_images (images: ${JSON.stringify(r.images)})`);
});

await client.end();
