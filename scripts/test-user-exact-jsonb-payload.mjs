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

console.log("=== Testando Inserção Direta com Array Exato Fornecido pelo Usuário ===");

const exactImagesArray = [
  "https://cdn-op.vesti.mobi/p/107524/b52ab7f2-423f-4bee-80b7-8f5436ae173c/87799-og.webp",
  "https://cdn-op.vesti.mobi/p/107524/b52ab7f2-423f-4bee-80b7-8f5436ae173c/88510-og.webp",
  "https://cdn-op.vesti.mobi/p/107524/b52ab7f2-423f-4bee-80b7-8f5436ae173c/55542-og.webp",
  "https://cdn-op.vesti.mobi/p/107524/b52ab7f2-423f-4bee-80b7-8f5436ae173c/47793-og.webp"
];

// Insert product directly into PostgreSQL using jsonb array
const slug = `vestido-test-user-exact-${Date.now()}`;
const resProd = await client.query(`
  insert into products (slug, title, category, images, status)
  values ($1, $2, $3, $4::jsonb, 'published')
  returning id, slug, images;
`, [slug, "Vestido Teste Exato Vesti Mobi", "Vestidos", JSON.stringify(exactImagesArray)]);

const prod = resProd.rows[0];
console.log("Produto Inserido:");
console.log("  ID:", prod.id);
console.log("  Slug:", prod.slug);
console.log("  images JSONB:", prod.images);

// Query product_images table to see what the trigger inserted!
const resImgs = await client.query(`
  select id, storage_path, position, hash
  from product_images
  where product_id = $1
  order by position asc;
`, [prod.id]);

console.log(`\nLinhas geradas automaticamente na tabela product_images (${resImgs.rows.length}):`);
resImgs.rows.forEach((r) => {
  console.log(`  [posição ${r.position}] -> ${r.storage_path}`);
});

if (resImgs.rows.length === 4) {
  console.log("\n✅ SUCESSO ABSOLUTO! 4 imagens criadas na tabela product_images!");
} else {
  console.error(`\n❌ FALHA: Esperado 4 imagens, obtido ${resImgs.rows.length}`);
}

// Cleanup test product
await client.query(`delete from products where id = $1;`, [prod.id]);

await client.end();
