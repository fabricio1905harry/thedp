import { copyFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

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

const destDir = path.join(rootDir, "public", "images", "products");
const brainDir = "C:\\Users\\Harry.Dev\\.gemini\\antigravity-ide\\brain\\94201971-8a7d-4b17-bc6a-7f4007d702e1";
const files = readdirSync(brainDir);

const backFile = files.find((f) => f.startsWith("vestido_um_ombro_back") && f.endsWith(".png"));
const detailFile = files.find((f) => f.startsWith("vestido_um_ombro_detail") && f.endsWith(".png"));

if (backFile) copyFileSync(path.join(brainDir, backFile), path.join(destDir, "vestido-um-ombro-back.png"));
if (detailFile) copyFileSync(path.join(brainDir, detailFile), path.join(destDir, "vestido-um-ombro-detail.png"));

// Find product id for vestido-um-ombro
const { data: prod } = await admin.from("products").select("id").eq("slug", "vestido-um-ombro").single();

if (prod) {
  await admin.from("product_images").delete().eq("product_id", prod.id);
  await admin.from("product_images").insert([
    { product_id: prod.id, storage_path: "/images/products/vestido-um-ombro.png", hash: "h-ombro-0", position: 0 },
    { product_id: prod.id, storage_path: "/images/products/vestido-um-ombro-back.png", hash: "h-ombro-1", position: 1 },
    { product_id: prod.id, storage_path: "/images/products/vestido-um-ombro-detail.png", hash: "h-ombro-2", position: 2 },
  ]);
  console.log("Inserted 3 gallery images for vestido-um-ombro into product_images table!");
}
