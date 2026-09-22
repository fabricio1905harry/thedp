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
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

console.log("=== INSPEÇÃO DOS TIPOS DE COLUNAS DA TABELA PRODUCTS ===");

const res = await client.query(`
  select column_name, data_type, udt_name
  from information_schema.columns
  where table_name = 'products'
  order by ordinal_position;
`);

for (const r of res.rows) {
  console.log(`- ${r.column_name}: data_type=${r.data_type}, udt_name=${r.udt_name}`);
}

await client.end();
