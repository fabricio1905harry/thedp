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

const password = "correcthorsebattery9";
const emailA = `smoke-addr-a-${Date.now()}@thedress-test.invalid`;
const emailB = `smoke-addr-b-${Date.now()}@thedress-test.invalid`;

const { data: userA } = await admin.auth.admin.createUser({ email: emailA, password, email_confirm: true });
const { data: userB } = await admin.auth.admin.createUser({ email: emailB, password, email_confirm: true });

async function signedInClient(email) {
  const c = createClient(url, anonKey);
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

const clientA = await signedInClient(emailA);
const clientB = await signedInClient(emailB);

console.log("1. customer A adds an address");
const { data: inserted, error: insertErr } = await clientA
  .from("addresses")
  .insert({ customer_id: userA.user.id, country: "US", city: "New York", line1: "123 Main St" })
  .select()
  .single();
if (insertErr) throw new Error(insertErr.message);
console.log(`   ok, id=${inserted.id}`);

console.log("2. customer B tries to read customer A's addresses (should be BLOCKED)");
const { data: leaked } = await clientB.from("addresses").select("*").eq("customer_id", userA.user.id);
console.log(`   rows visible to B: ${leaked?.length ?? 0}`);
if ((leaked?.length ?? 0) !== 0) throw new Error("SECURITY BUG: customer B can read customer A's address!");

console.log("3. customer B tries to delete customer A's address (should be BLOCKED / no-op)");
const { data: deleted } = await clientB.from("addresses").delete().eq("id", inserted.id).select();
console.log(`   rows deleted by B: ${deleted?.length ?? 0}`);
if ((deleted?.length ?? 0) !== 0) throw new Error("SECURITY BUG: customer B deleted customer A's address!");

console.log("4. customer A reads their own address (should work)");
const { data: ownRead } = await clientA.from("addresses").select("*").eq("id", inserted.id);
console.log(`   rows visible to A: ${ownRead?.length ?? 0}`);
if ((ownRead?.length ?? 0) !== 1) throw new Error("customer A cannot read their own address!");

console.log("\ncleanup");
await admin.from("addresses").delete().eq("id", inserted.id);
await admin.auth.admin.deleteUser(userA.user.id);
await admin.auth.admin.deleteUser(userB.user.id);

console.log("\nALL CHECKS PASSED — address RLS is owner-scoped correctly.");
