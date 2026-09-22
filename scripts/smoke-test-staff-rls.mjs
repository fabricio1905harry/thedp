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
const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const customerEmail = `smoke-rls-customer-${Date.now()}@thedress-test.invalid`;
const operatorEmail = `smoke-rls-operator-${Date.now()}@thedress-test.invalid`;
const password = "correcthorsebattery9";

console.log("setup: create a plain customer and an operator");
const { data: customerUser } = await admin.auth.admin.createUser({
  email: customerEmail,
  password,
  email_confirm: true,
});
const { data: operatorUser } = await admin.auth.admin.createUser({
  email: operatorEmail,
  password,
  email_confirm: true,
});
await admin.from("customers").update({ role: "operator" }).eq("id", operatorUser.user.id);

const { data: product } = await admin
  .from("products")
  .insert({
    slug: "smoke-rls-dress",
    title: "RLS Test Dress",
    category: "Teste",
    original_price: 100,
    markup: 0,
    status: "draft",
  })
  .select()
  .single();

async function signedInClient(email) {
  const c = createClient(url, anonKey);
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn failed for ${email}: ${error.message}`);
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

console.log("\n1. plain customer tries to publish the product (should be BLOCKED by RLS)");
const customerClient = await signedInClient(customerEmail);
const { data: customerResult, error: customerErr } = await customerClient
  .from("products")
  .update({ status: "published" })
  .eq("id", product.id)
  .select();
console.log(`   error=${customerErr?.message ?? "none"}, rows affected=${customerResult?.length ?? 0}`);
if ((customerResult?.length ?? 0) !== 0) {
  throw new Error("SECURITY BUG: a plain customer was able to publish a product!");
}

console.log("\n2. operator publishes the product (should SUCCEED via is_staff() policy)");
const operatorClient = await signedInClient(operatorEmail);
const { data: operatorResult, error: operatorErr } = await operatorClient
  .from("products")
  .update({ status: "published" })
  .eq("id", product.id)
  .select();
if (operatorErr) throw new Error(`operator update failed: ${operatorErr.message}`);
console.log(`   rows affected=${operatorResult?.length ?? 0}, status=${operatorResult?.[0]?.status}`);
if (operatorResult?.[0]?.status !== "published") {
  throw new Error("operator (is_staff) could not publish — RLS policy too strict");
}

console.log("\n3. plain customer tries to read another customer's row (should be BLOCKED)");
const { data: customersLeak } = await customerClient
  .from("customers")
  .select("id, email")
  .neq("id", customerUser.user.id);
console.log(`   rows visible: ${customersLeak?.length ?? 0}`);
if ((customersLeak?.length ?? 0) !== 0) {
  throw new Error("SECURITY BUG: a plain customer can read other customers' rows!");
}

console.log("\ncleanup");
await admin.from("products").delete().eq("id", product.id);
await admin.auth.admin.deleteUser(customerUser.user.id);
await admin.auth.admin.deleteUser(operatorUser.user.id);

console.log("\nALL CHECKS PASSED — RLS correctly blocks plain customers and allows staff.");
