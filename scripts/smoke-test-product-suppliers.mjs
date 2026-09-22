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

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("=== Testing Product-Supplier Linking ===");

// 1. Get connectors
const { data: connectors, error: connErr } = await admin
  .from("connectors")
  .select("id, supplier_name");

if (connErr || !connectors || connectors.length === 0) {
  console.error("FAILED to load connectors:", connErr);
  process.exit(1);
}
console.log(`Found ${connectors.length} connectors in DB.`);

const f1 = connectors.find((c) => c.supplier_name === "fornecedor_1") ?? connectors[0];
const f2 = connectors.find((c) => c.supplier_name === "fornecedor_2") ?? connectors[1];

// 2. Insert/Ingest a product linked to fornecedor_1 and fornecedor_2
const testProductSlug = "vestido-teste-fornecedores";
const payload = {
  slug: testProductSlug,
  title: "Vestido Teste Fornecedores",
  original_price: 350.0,
  markup: 50.0,
  tamanhos: "38, 40",
  cores: "Preto, Branco",
  suppliers: ["fornecedor_1", "fornecedor_2"],
  status: "published",
};

const res = await fetch("http://localhost:3005/api/ingest/product", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  },
  body: JSON.stringify(payload),
});

const ingestResult = await res.json();
if (!res.ok || !ingestResult.success) {
  console.error("Ingestion failed:", ingestResult);
  process.exit(1);
}

console.log("Ingested product with suppliers:", ingestResult);

// 3. Verify in DB
const { data: prodDb, error: prodErr } = await admin
  .from("products")
  .select(`
    id, slug, title, connector_id,
    product_connectors ( connector_id, connectors ( supplier_name ) )
  `)
  .eq("slug", testProductSlug)
  .single();

if (prodErr || !prodDb) {
  console.error("FAILED to retrieve product from DB:", prodErr);
  process.exit(1);
}

console.log("Product retrieved from DB:", JSON.stringify(prodDb, null, 2));

if (prodDb.connector_id !== f1.id) {
  console.error(`ERROR: Expected primary connector_id ${f1.id}, got ${prodDb.connector_id}`);
  process.exit(1);
}

const linkedSupplierNames = prodDb.product_connectors.map((pc) => pc.connectors.supplier_name);
console.log("Linked Supplier Names:", linkedSupplierNames);

if (!linkedSupplierNames.includes("fornecedor_1") || !linkedSupplierNames.includes("fornecedor_2")) {
  console.error("ERROR: product_connectors did not link both suppliers.");
  process.exit(1);
}

console.log("=== ALL PRODUCT-SUPPLIER TESTS PASSED! ===");
