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

console.log("1. insert draft product (original_price/markup, no sizes/colors yet)");
const { data: product, error: insertErr } = await admin
  .from("products")
  .insert({
    slug: "smoke-test-moderation-dress",
    title: "Vestido Moderation Test",
    category: "Teste",
    original_price: 200,
    markup: 70,
    status: "draft",
  })
  .select()
  .single();
if (insertErr) throw new Error(insertErr.message);
console.log(`   ok, id=${product.id}, status=${product.status}, price_brl=${product.price_brl} (expect 270)`);
if (Number(product.price_brl) !== 270) throw new Error("price_brl trigger did not compute correctly on insert");

console.log("2. simulate ADM-03 edit: update original_price/markup/hs_code/dims/sizes/colors");
const { error: updateErr } = await admin
  .from("products")
  .update({
    original_price: 220,
    markup: 88,
    hs_code: "6204.44",
    weight_g: 450,
    dims_cm: { length: 30, width: 25, height: 5 },
    sizes: ["38", "40", "42"],
    colors: ["Marsala", "Verde"],
    default_stock: 3,
  })
  .eq("id", product.id);
if (updateErr) throw new Error(updateErr.message);

console.log("3. simulate ADM-02/CAT-04 bulk publish");
const { error: publishErr } = await admin
  .from("products")
  .update({ status: "published" })
  .eq("id", product.id);
if (publishErr) throw new Error(publishErr.message);

const { data: after } = await admin
  .from("products")
  .select("status, price_brl, hs_code, dims_cm")
  .eq("id", product.id)
  .single();
console.log("   after:", after);
if (after.status !== "published") throw new Error("publish did not stick");
if (after.hs_code !== "6204.44") throw new Error("hs_code did not stick");
if (Number(after.price_brl) !== 308) throw new Error("price_brl did not recompute on original_price/markup change");

console.log("4. variant matrix should have generated 3 sizes x 2 colors = 6 variants");
const { data: variants } = await admin
  .from("variants")
  .select("size, color, stock")
  .eq("product_id", product.id);
console.log(`   variant count: ${variants.length} (expect 6)`);
if (variants.length !== 6) throw new Error("variant matrix generation did not produce 6 rows");
if (!variants.every((v) => v.stock === 3)) throw new Error("default_stock did not propagate to new variants");

console.log("5. products_public should now include it (published + public view)");
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const { data: pub } = await anon.from("products_public").select("slug").eq("slug", "smoke-test-moderation-dress");
console.log(`   found in public view: ${pub.length === 1}`);
if (pub.length !== 1) throw new Error("published product missing from products_public");

console.log("\n6. cleanup");
await admin.from("products").delete().eq("id", product.id);

console.log("\nALL CHECKS PASSED — draft -> edit -> publish -> price triggers -> variant matrix -> visible in public catalog.");
