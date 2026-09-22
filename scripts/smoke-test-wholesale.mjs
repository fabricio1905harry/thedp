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

const email = `smoke-wholesale-${Date.now()}@thedress-test.invalid`;

console.log("1. create user with business metadata (mirrors the signup form's payload)");
const { data: created, error } = await admin.auth.admin.createUser({
  email,
  password: "correcthorsebattery9",
  email_confirm: true,
  user_metadata: {
    name: "Jane Buyer",
    locale: "en",
    customer_type: "business",
    company_name: "Buyer Co Ltda",
    tax_id: "12.345.678/0001-90",
  },
});
if (error) throw new Error(error.message);

console.log("2. trigger should have carried company fields into customers");
const { data: customer, error: readErr } = await admin
  .from("customers")
  .select("status, customer_type, company_name, tax_id")
  .eq("id", created.user.id)
  .single();
if (readErr) throw new Error(readErr.message);
console.log("   ", customer);

if (customer.status !== "pending") throw new Error("expected pending status");
if (customer.customer_type !== "business") throw new Error("customer_type did not carry through");
if (customer.company_name !== "Buyer Co Ltda") throw new Error("company_name did not carry through");
if (customer.tax_id !== "12.345.678/0001-90") throw new Error("tax_id did not carry through");

console.log("\n3. default (no metadata) signup should still default to individual");
const email2 = `smoke-individual-${Date.now()}@thedress-test.invalid`;
const { data: created2 } = await admin.auth.admin.createUser({
  email: email2,
  password: "correcthorsebattery9",
  email_confirm: true,
});
const { data: customer2 } = await admin
  .from("customers")
  .select("customer_type, company_name")
  .eq("id", created2.user.id)
  .single();
console.log("   ", customer2);
if (customer2.customer_type !== "individual") throw new Error("default customer_type should be individual");

console.log("\ncleanup");
await admin.auth.admin.deleteUser(created.user.id);
await admin.auth.admin.deleteUser(created2.user.id);

console.log("\nALL CHECKS PASSED — business signup carries company fields, default stays individual.");
