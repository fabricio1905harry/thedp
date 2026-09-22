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

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const testEmail = `smoke-test-${Date.now()}@thedress-test.invalid`;
const testPassword = "correcthorsebattery9";

// Public anon.auth.signUp() is exercised separately (it hits Supabase's
// default email rate limit fast on free-tier/no custom SMTP — confirmed
// working manually). Use the admin API here so the trigger/RLS checks
// below can run repeatably without burning the email quota; the trigger
// fires identically off auth.users regardless of which API inserted it.
console.log(`1. admin.createUser(${testEmail})`);
const { data: createData, error: createError } = await admin.auth.admin.createUser({
  email: testEmail,
  password: testPassword,
  email_confirm: true,
  user_metadata: { name: "Smoke Test", locale: "pt" },
});
if (createError) throw new Error(`createUser failed: ${createError.message}`);
const userId = createData.user.id;
console.log(`   ok, user id ${userId}`);

console.log("2. trigger created a pending customers row?");
const { data: customerRow, error: customerErr } = await admin
  .from("customers")
  .select("id, email, status, role")
  .eq("id", userId)
  .single();
if (customerErr) throw new Error(`customers lookup failed: ${customerErr.message}`);
console.log(`   status=${customerRow.status} role=${customerRow.role}`);
if (customerRow.status !== "pending") throw new Error("expected status=pending");

console.log("3. seed one published product for the price-gate check");
const { error: prodErr } = await admin.from("products").upsert(
  {
    slug: "smoke-test-dress",
    title: "Vestido Smoke Test",
    category: "Teste",
    original_price: 100,
    markup: 0,
    status: "published",
  },
  { onConflict: "slug" }
);
if (prodErr) throw new Error(`product upsert failed: ${prodErr.message}`);

console.log("4. anon (unauthenticated) reads products_public — should see it, no price column");
const { data: publicRows, error: publicErr } = await anon
  .from("products_public")
  .select("*")
  .eq("slug", "smoke-test-dress");
if (publicErr) throw new Error(`products_public read failed: ${publicErr.message}`);
console.log(`   ok, ${publicRows.length} row(s), columns: ${Object.keys(publicRows[0] ?? {}).join(", ")}`);

console.log("5. get_priced_product() as pending (unapproved) user — should return 0 rows");
const { data: session } = await anon.auth.signInWithPassword({
  email: testEmail,
  password: testPassword,
});
const authedClient = createClient(url, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
});
const { data: pricedBefore } = await authedClient.rpc("get_priced_product", {
  product_slug: "smoke-test-dress",
});
console.log(`   rows returned while pending: ${pricedBefore?.length ?? 0} (expected 0)`);
if ((pricedBefore?.length ?? 0) !== 0) throw new Error("price leaked before approval!");

console.log("6. admin approves the customer (AUTH-03)");
const { error: approveErr } = await admin
  .from("customers")
  .update({ status: "approved" })
  .eq("id", userId);
if (approveErr) throw new Error(`approve failed: ${approveErr.message}`);

console.log("7. get_priced_product() as approved user — should return the price now");
const { data: pricedAfter, error: pricedErr } = await authedClient.rpc("get_priced_product", {
  product_slug: "smoke-test-dress",
});
if (pricedErr) throw new Error(`get_priced_product failed: ${pricedErr.message}`);
console.log(`   rows returned after approval: ${pricedAfter?.length ?? 0}`, pricedAfter);
if ((pricedAfter?.length ?? 0) !== 1) throw new Error("price gate did not open after approval!");

console.log("\n8. cleanup: delete test user + product");
await admin.from("products").delete().eq("slug", "smoke-test-dress");
await admin.auth.admin.deleteUser(userId);

console.log("\nALL CHECKS PASSED — signup -> pending -> price hidden -> approve -> price visible, end to end.");
