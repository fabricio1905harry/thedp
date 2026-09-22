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

const client = new pg.Client({
  connectionString: env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows: tables } = await client.query(`
  select table_name, rowsecurity
  from information_schema.tables t
  join pg_tables pt on pt.tablename = t.table_name and pt.schemaname = 'public'
  where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
  order by table_name;
`);
console.log("tables (rls enabled):");
for (const t of tables) console.log(`  ${t.table_name}: rls=${t.rowsecurity}`);

const { rows: connectors } = await client.query("select supplier_name, status from connectors order by supplier_name");
console.log("\nconnectors seed:", connectors);

const { rows: view } = await client.query("select count(*) from products_public");
console.log("\nproducts_public view reachable, count:", view[0].count);

const { rows: fn } = await client.query(
  "select proname from pg_proc where proname in ('get_priced_product', 'is_staff', 'handle_new_customer')"
);
console.log("\nfunctions present:", fn.map((r) => r.proname));

await client.end();
