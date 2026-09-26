import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { ProductPricing, Variant } from "@/lib/types";

export interface CatalogProduct {
  id: string;
  slug: string;
  title: string;
  titleEn: string | null;
  titleEs: string | null;
  category: string | null;
  isFeatured: boolean;
  createdAt: string;
  pricing: ProductPricing | null;
  imageUrl: string | null;
}

async function getPublicProducts(limit = 50) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products_public")
    .select(`
      id, slug, title, title_en, title_es, category, is_featured, created_at,
      product_images ( storage_path, position )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

interface PricedCatalogRow {
  id: string;
  price_brl: number | null;
  price_usd: number | null;
  price_eur: number | null;
}

async function getPricingMap(approved: boolean) {
  const map = new Map<string, ProductPricing>();
  if (!approved) return map;

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_priced_catalog");
  for (const row of (data ?? []) as PricedCatalogRow[]) {
    map.set(row.id, { priceBrl: row.price_brl, priceUsd: row.price_usd, priceEur: row.price_eur });
  }
  return map;
}

function toCatalogProduct(
  row: Awaited<ReturnType<typeof getPublicProducts>>[number],
  pricingMap: Map<string, ProductPricing>
): CatalogProduct {
  const sortedImages = Array.isArray(row.product_images)
    ? [...row.product_images].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    : [];
  const primaryImage = sortedImages[0]?.storage_path ?? null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    titleEn: row.title_en,
    titleEs: row.title_es,
    category: row.category,
    isFeatured: row.is_featured,
    createdAt: row.created_at,
    pricing: pricingMap.get(row.id) ?? null,
    imageUrl: primaryImage,
  };
}

export async function getPublicProductsList(
  approved: boolean,
  limit = 50
): Promise<CatalogProduct[]> {
  const [publicProducts, pricingMap] = await Promise.all([
    getPublicProducts(limit),
    getPricingMap(approved),
  ]);
  return publicProducts.map((row) => toCatalogProduct(row, pricingMap));
}

export async function getHomeCatalogSections(
  approved: boolean
): Promise<{ key: string; products: CatalogProduct[] }[]> {
  const merged = await getPublicProductsList(approved, 50);

  return [
    { key: "novidades", products: merged.slice(0, 8) },
    { key: "destaques", products: merged.filter((p) => p.isFeatured).slice(0, 8) },
  ];
}

export async function getCategoryProducts(
  category: string,
  approved: boolean
): Promise<CatalogProduct[]> {
  const supabase = await createClient();
  const [{ data }, pricingMap] = await Promise.all([
    supabase
      .from("products_public")
      .select(`
        id, slug, title, title_en, title_es, category, is_featured, created_at,
        product_images ( storage_path, position )
      `)
      .ilike("category", category)
      .order("created_at", { ascending: false }),
    getPricingMap(approved),
  ]);
  return (data ?? []).map((row) => toCatalogProduct(row, pricingMap));
}

export function getAllCategories(): Promise<string[]> {
  return createClient().then(async (supabase) => {
    const { data } = await supabase.from("products_public").select("category");
    const set = new Set((data ?? []).map((r) => r.category).filter(Boolean) as string[]);
    return Array.from(set);
  });
}

export interface ProductDetail {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  pricing: ProductPricing | null;
  imageUrl: string | null;
  images: string[];
  sizes: string[];
  colors: string[];
  variants: Variant[];
}

/**
 * Sizes/colors/pricing only come back for approved customers
 * (get_priced_product is SECURITY DEFINER and checks that itself);
 * variants and product_images are fetched separately.
 */
export async function getProductDetail(
  slug: string,
  approved: boolean
): Promise<ProductDetail | null> {
  const supabase = await createClient();

  const { data: pub } = await supabase
    .from("products_public")
    .select("id, slug, title, category")
    .eq("slug", slug)
    .maybeSingle();
  if (!pub) return null;

  const serviceClient = createServiceRoleClient();

  const [{ data: full }, { data: imageRows }] = await Promise.all([
    supabase
      .from("products")
      .select("description")
      .eq("id", pub.id)
      .maybeSingle(),
    serviceClient
      .from("product_images")
      .select("storage_path, position")
      .eq("product_id", pub.id)
      .order("position", { ascending: true }),
  ]);

  const images = (imageRows ?? []).map((img) => img.storage_path);
  const primaryImage = images[0] ?? null;

  if (!approved) {
    return {
      id: pub.id,
      slug: pub.slug,
      title: pub.title,
      description: full?.description ?? null,
      category: pub.category,
      pricing: null,
      imageUrl: primaryImage,
      images,
      sizes: [],
      colors: [],
      variants: [],
    };
  }

  interface PricedProductRow {
    price_brl: number | null;
    price_usd: number | null;
    price_eur: number | null;
    sizes: string[];
    colors: string[];
  }

  const [{ data: priced }, { data: variantRows }] = await Promise.all([
    supabase
      .rpc("get_priced_product", { product_slug: slug })
      .maybeSingle<PricedProductRow>(),
    serviceClient.from("variants").select("id, size, size_br, size_us, size_eu, color, sku, stock").eq("product_id", pub.id),
  ]);

  return {
    id: pub.id,
    slug: pub.slug,
    title: pub.title,
    description: full?.description ?? null,
    category: pub.category,
    pricing: priced
      ? { priceBrl: priced.price_brl, priceUsd: priced.price_usd, priceEur: priced.price_eur }
      : null,
    imageUrl: primaryImage,
    images,
    sizes: priced?.sizes ?? [],
    colors: priced?.colors ?? [],
    variants: (variantRows ?? []).map((v) => ({
      id: v.id,
      size: v.size,
      sizeBr: v.size_br,
      sizeUs: v.size_us,
      sizeEu: v.size_eu,
      color: v.color,
      sku: v.sku,
      stock: v.stock,
    })),
  };
}
