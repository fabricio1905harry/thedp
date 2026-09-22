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

console.log("=== Seeding Published Catalog Products with Images in product_images ===");

const sampleProducts = [
  {
    slug: "vestido-um-ombro",
    title: "VESTIDO UM OMBRO",
    title_en: "One-Shoulder Silk Dress",
    title_es: "Vestido de Un Hombro",
    category: "Vestidos",
    original_price: 419.0,
    markup: 81.0,
    sizes: ["38", "40", "42", "44"],
    colors: ["Verde Oliva", "Terracota", "Marsala"],
    default_stock: 10,
    status: "published",
    is_featured: true,
    images: [
      "https://cdn-op.vesti.mobi/p/107524/b52ab7f2-423f-4bee-80b7-8f5436ae173c/87799-og.webp",
      "/images/products/vestido-um-ombro.png"
    ],
  },
  {
    slug: "vestido-longo-seresta",
    title: "VESTIDO LONGO SERESTA",
    title_en: "Seresta Evening Long Dress",
    title_es: "Vestido Largo Seresta",
    category: "Festas",
    original_price: 520.0,
    markup: 100.0,
    sizes: ["36", "38", "40", "42"],
    colors: ["Azul Marinho", "Preto", "Vinho"],
    default_stock: 8,
    status: "published",
    is_featured: true,
    images: ["/images/products/vestido-longo-seresta.png"],
  },
  {
    slug: "vestido-midalia-seda",
    title: "VESTIDO MIDALIA SEDA",
    title_en: "Midalia Silk Midi Dress",
    title_es: "Vestido Midi de Seda Midalia",
    category: "Casual Chic",
    original_price: 380.0,
    markup: 70.0,
    sizes: ["P", "M", "G"],
    colors: ["Fúcsia", "Esmeralda", "Nude"],
    default_stock: 12,
    status: "published",
    is_featured: true,
    images: ["/images/products/vestido-midalia-seda.png"],
  },
  {
    slug: "vestido-evase-elegante",
    title: "VESTIDO EVASÊ ELEGANTE",
    title_en: "Elegant A-Line Dress",
    title_es: "Vestido Evase Elegante",
    category: "Elegante",
    original_price: 460.0,
    markup: 90.0,
    sizes: ["38", "40", "42"],
    colors: ["Champagne", "Preto"],
    default_stock: 15,
    status: "published",
    is_featured: true,
    images: ["/images/products/vestido-evase-elegante.png"],
  },
];

for (const prod of sampleProducts) {
  const { data: insertedProduct, error } = await admin
    .from("products")
    .upsert(prod, { onConflict: "slug" })
    .select("id, slug, title, status, images")
    .single();

  if (error) {
    console.error(`Failed to upsert ${prod.slug}:`, error.message);
    continue;
  }

  console.log(`Upserted product: ${insertedProduct.title} (id=${insertedProduct.id})`);

  const { data: imgRows } = await admin
    .from("product_images")
    .select("storage_path, position")
    .eq("product_id", insertedProduct.id);

  console.log(`  -> Auto-synced ${imgRows?.length ?? 0} images into product_images:`);
  imgRows?.forEach((r) => console.log(`     [pos ${r.position}] -> ${r.storage_path}`));
}

console.log("SEEDING COMPLETED SUCCESSFULLY!");
