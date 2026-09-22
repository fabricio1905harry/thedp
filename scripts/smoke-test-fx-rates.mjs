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

const operatorEmail = `smoke-fx-operator-${Date.now()}@thedress-test.invalid`;
const password = "correcthorsebattery9";

const { data: operatorUser } = await admin.auth.admin.createUser({
  email: operatorEmail,
  password,
  email_confirm: true,
});
await admin.from("customers").update({ role: "operator" }).eq("id", operatorUser.user.id);

const opClient = createClient(url, anonKey);
const { data: session } = await opClient.auth.signInWithPassword({ email: operatorEmail, password });
const operatorClient = createClient(url, anonKey, {
  global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
});

console.log("1. operator inserts a zero rate (should be BLOCKED by fx_rates_staff_write check)");
const { error: zeroErr } = await operatorClient
  .from("fx_rates")
  .insert({ base: "BRL", quote: "USD", rate: 0, updated_by: operatorUser.user.id });
console.log(`   error: ${zeroErr ? "blocked as expected" : "NOT BLOCKED — bug"}`);
if (!zeroErr) throw new Error("SECURITY/VALIDATION BUG: zero rate was accepted");

console.log("2. operator inserts a negative rate (should be BLOCKED)");
const { error: negErr } = await operatorClient
  .from("fx_rates")
  .insert({ base: "BRL", quote: "USD", rate: -5, updated_by: operatorUser.user.id });
console.log(`   error: ${negErr ? "blocked as expected" : "NOT BLOCKED — bug"}`);
if (!negErr) throw new Error("VALIDATION BUG: negative rate was accepted");

console.log("3. operator inserts a valid rate (should succeed) and product prices recompute");
const { data: product } = await admin
  .from("products")
  .insert({ slug: "smoke-fx-dress", title: "FX Test Dress", original_price: 100, markup: 0, status: "draft" })
  .select()
  .single();

const { error: goodErr } = await operatorClient
  .from("fx_rates")
  .insert({ base: "BRL", quote: "USD", rate: 5.0, updated_by: operatorUser.user.id });
if (goodErr) throw new Error(`valid rate insert failed: ${goodErr.message}`);

const { data: afterRate } = await admin.from("products").select("price_usd").eq("id", product.id).single();
console.log(`   price_usd after rate=5.0: ${afterRate.price_usd} (expect 20)`);
if (Number(afterRate.price_usd) !== 20) throw new Error("fx_rates_recompute_products trigger did not fire");

console.log("4. plain (non-staff) customer cannot insert a rate");
const customerEmail = `smoke-fx-customer-${Date.now()}@thedress-test.invalid`;
await admin.auth.admin.createUser({ email: customerEmail, password, email_confirm: true });
const custClient = createClient(url, anonKey);
const { data: custSession } = await custClient.auth.signInWithPassword({ email: customerEmail, password });
const customerClient = createClient(url, anonKey, {
  global: { headers: { Authorization: `Bearer ${custSession.session.access_token}` } },
});
const { error: custErr, data: custResult } = await customerClient
  .from("fx_rates")
  .insert({ base: "BRL", quote: "EUR", rate: 6.0 })
  .select();
console.log(`   rows inserted by plain customer: ${custResult?.length ?? 0} (expect 0)`);
if ((custResult?.length ?? 0) !== 0) throw new Error("SECURITY BUG: plain customer inserted an fx_rate!");

console.log("\ncleanup");
await admin.from("products").delete().eq("id", product.id);
await admin.from("fx_rates").delete().eq("rate", 5.0).eq("quote", "USD");
await admin.auth.admin.deleteUser(operatorUser.user.id);
const { data: custUser } = await admin.auth.admin.listUsers();
const toDelete = custUser.users.find((u) => u.email === customerEmail);
if (toDelete) await admin.auth.admin.deleteUser(toDelete.id);

console.log("\nALL CHECKS PASSED — fx_rates validation, recompute trigger, and staff-only RLS all correct.");
