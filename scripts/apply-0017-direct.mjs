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

const databaseUrl = env.SUPABASE_DB_URL || env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Missing database URL");
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

const sql = readFileSync(path.join(rootDir, "supabase/migrations/0022_orders_rls_and_shipping_address.sql"), "utf8");
await client.query(sql);
console.log("Successfully applied 0022_orders_rls_and_shipping_address.sql directly!");
await client.end();
