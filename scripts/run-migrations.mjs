import { readFileSync, readdirSync } from "node:fs";
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

const connectionString = env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("SUPABASE_DB_URL not set in .env.local — add the Postgres connection string from Project Settings → Database.");
  process.exit(1);
}

const migrationsDir = path.join(rootDir, "supabase", "migrations");
const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query(`
    create table if not exists _migrations_applied (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  // Bootstrap: 0001_init.sql may have already been pasted into the SQL
  // Editor by hand before this script existed. Detect that and record it
  // instead of re-running (the file has no IF NOT EXISTS guards).
  const { rows: alreadyTracked } = await client.query(
    "select 1 from _migrations_applied where name = $1",
    ["0001_init.sql"]
  );
  if (alreadyTracked.length === 0) {
    const { rows: existing } = await client.query(
      "select 1 from information_schema.tables where table_schema = 'public' and table_name = 'customers'"
    );
    if (existing.length > 0) {
      console.log("0001_init.sql already applied manually — marking as tracked without re-running.");
      await client.query("insert into _migrations_applied (name) values ($1)", ["0001_init.sql"]);
    }
  }

  for (const file of files) {
    const { rows } = await client.query(
      "select 1 from _migrations_applied where name = $1",
      [file]
    );
    if (rows.length > 0) {
      console.log(`skip (already applied): ${file}`);
      continue;
    }

    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`applying: ${file}`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into _migrations_applied (name) values ($1)", [file]);
      await client.query("commit");
      console.log(`  ok`);
    } catch (err) {
      await client.query("rollback");
      console.error(`  FAILED: ${err.message}`);
      throw err;
    }
  }
} finally {
  await client.end();
}
