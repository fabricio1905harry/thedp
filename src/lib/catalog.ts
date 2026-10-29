import { headers } from "next/headers";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { SITE_MODE_HEADER } from "@/lib/site-mode";
import { operationForSiteMode, type OperationCode } from "@/lib/cms-types";
import type { ProductPricing, Variant } from "@/lib/types";
import { parseCrop, type ImageCrop } from "@/lib/image-crop";
import { getColorResolver } from "@/lib/colors";
import { matchSize, toSizeInfo, type SizeChartRow, type SizeInfo } from "@/lib/size-format";

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
  imageCrop: ImageCrop | null;
}

/** Operation of the current request (Brazil mirror vs international); products can be hidden per operation. */
async function currentOperation(): Promise<OperationCode> {
  try {
    return operationForSiteMode((await headers()).get(SITE_MODE_HEADER));
  } catch {
    return "intl_b2b";
  }
}

const visibleIn = (ops: string[] | null | undefined, op: string) => !Array.isArray(ops) || ops.includes(op);

const hasDb = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

async function getPublicProducts(limit = 50) {
  if (!hasDb()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("products_public")
    .select(`
      id, slug, title, title_en, title_es, category, is_featured, created_at,
      product_images ( storage_path, position, is_cover, crop )
    `)
    .eq("product_images.review_status", "approved")
    .contains("visible_ops", [await currentOperation()])
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
  if (!approved || !hasDb()) return map;

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
  // Buyers only see APPROVED images; the MAIN IMAGE/COVER leads.
  const sortedImages = Array.isArray(row.product_images)
    ? [...row.product_images].sort(
        (a, b) => Number(b.is_cover) - Number(a.is_cover) || (a.position ?? 0) - (b.position ?? 0)
      )
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
    imageCrop: parseCrop(sortedImages[0]?.crop),
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
        product_images ( storage_path, position, is_cover, crop )
      `)
      .eq("product_images.review_status", "approved")
      .contains("visible_ops", [await currentOperation()])
      .ilike("category", category)
      .order("created_at", { ascending: false }),
    getPricingMap(approved),
  ]);
  return (data ?? []).map((row) => toCatalogProduct(row, pricingMap));
}

export function getAllCategories(): Promise<string[]> {
  if (!hasDb()) return Promise.resolve([]);
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
  composition: string | null;
  /** ISO 3166-1 alpha-2 */
  originCountry: string;
  category: string | null;
  pricing: ProductPricing | null;
  imageUrl: string | null;
  images: string[];
  imageCrops: (ImageCrop | null)[];
  /** Buyer-facing reference: TDP + supplier reference (never the supplier name). */
  reference: string | null;
  sizes: string[];
  /** Buyer-facing color names (TDP name in the buyer's language). */
  colors: string[];
  /** Swatch hex by buyer-facing color name (normalized colors only). */
  colorHex: Record<string, string>;
  /** Size chart match (BR/US/EU/letter) by size as listed in `sizes`. */
  sizeInfo: Record<string, SizeInfo>;
  variants: Variant[];
}

/**
 * Sizes/colors/pricing only come back for approved customers
 * (get_priced_product is SECURITY DEFINER and checks that itself);
 * variants and product_images are fetched separately.
 */
export async function getProductDetail(
  slug: string,
  approved: boolean,
  locale = "en",
  sizeChart: SizeChartRow[] = []
): Promise<ProductDetail | null> {
  const supabase = await createClient();
  const operation = await currentOperation();

  const { data: pub } = await supabase
    .from("products_public")
    .select("id, slug, title, category, visible_ops")
    .eq("slug", slug)
    .maybeSingle();
  if (!pub || !visibleIn(pub.visible_ops, operation)) return null;

  const serviceClient = createServiceRoleClient();

  const [{ data: full }, { data: imageRows }] = await Promise.all([
    supabase
      .from("products")
      .select("description, description_en, description_es, composition, origin_country, tdp_ref, source_id")
      .eq("id", pub.id)
      .maybeSingle(),
    serviceClient
      .from("product_images")
      .select("storage_path, position, is_cover, crop")
      .eq("product_id", pub.id)
      .eq("review_status", "approved")
      .order("is_cover", { ascending: false })
      .order("position", { ascending: true }),
  ]);

  const images = (imageRows ?? []).map((img) => img.storage_path);
  const imageCrops = (imageRows ?? []).map((img) => parseCrop(img.crop));
  const primaryImage = images[0] ?? null;
  const description =
    (locale === "es" ? full?.description_es : locale === "en" ? full?.description_en : full?.description) ||
    full?.description_en ||
    full?.description ||
    null;
  const reference = full?.tdp_ref || (full?.source_id ? `TDP${full.source_id}` : null);
  const composition = full?.composition ?? null;
  const originCountry = full?.origin_country ?? "BR";

  if (!approved) {
    return {
      id: pub.id,
      slug: pub.slug,
      title: pub.title,
      description,
      composition,
      originCountry,
      category: pub.category,
      pricing: null,
      imageUrl: primaryImage,
      images,
      imageCrops,
      reference,
      sizes: [],
      colors: [],
      colorHex: {},
      sizeInfo: {},
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
    serviceClient.from("variants").select("id, size, size_br, size_us, size_eu, color, sku, stock, visible_ops").eq("product_id", pub.id),
  ]);

  // Supplier color text stays internal: buyers get the TDP name in their language.
  const resolver = await getColorResolver(locale);
  const rawColors = [
    ...new Set<string>([...(priced?.colors ?? []), ...(variantRows ?? []).map((v) => v.color as string).filter(Boolean)]),
  ];
  const labelByRaw = new Map<string, string>();
  const taken = new Map<string, number>();
  const colorHex: Record<string, string> = {};
  for (const raw of rawColors) {
    let label = resolver.label(raw);
    const n = (taken.get(label) ?? 0) + 1;
    taken.set(label, n);
    // two supplier colors of one style that normalize to the same TDP color stay distinguishable
    if (n > 1) label = `${label} (${n})`;
    labelByRaw.set(raw, label);
    const hex = resolver.hex(raw);
    if (hex) colorHex[label] = hex;
  }
  const sizes = priced?.sizes ?? [];
  const sizeInfo: Record<string, SizeInfo> = {};
  for (const sz of sizes) {
    const row = matchSize(sizeChart, sz);
    if (row) sizeInfo[sz] = toSizeInfo(row);
  }

  return {
    id: pub.id,
    slug: pub.slug,
    title: pub.title,
    description,
    composition,
    originCountry,
    category: pub.category,
    pricing: priced
      ? { priceBrl: priced.price_brl, priceUsd: priced.price_usd, priceEur: priced.price_eur }
      : null,
    imageUrl: primaryImage,
    images,
    imageCrops,
    reference,
    sizes,
    colors: (priced?.colors ?? []).map((c) => labelByRaw.get(c) ?? c),
    colorHex,
    sizeInfo,
    variants: (variantRows ?? []).filter((v) => visibleIn(v.visible_ops, operation)).map((v) => ({
      id: v.id,
      size: v.size,
      sizeBr: v.size_br,
      sizeUs: v.size_us,
      sizeEu: v.size_eu,
      color: labelByRaw.get(v.color as string) ?? v.color,
      sku: v.sku,
      // availability flag only (1 = can be requested) — real quantities never reach the buyer
      stock: Number(v.stock) > 0 ? 1 : 0,
    })),
  };
}


// ---------------------------------------------------------------------
// Shop / Home modules
// ---------------------------------------------------------------------

export interface ShopProduct extends CatalogProduct {
  /** Sizes / colors that still have stock (never the quantities). */
  sizes: string[];
  colors: string[];
  soldOut: boolean;
  /** All-time units sold (paid orders) — drives Best Sellers. */
  sales: number;
}

const SOLD_STATUSES = ["reserved", "paid", "processing", "shipped", "delivered"];

/**
 * Published catalog with the facets the Shop filters need and the sales
 * ranking behind Best Sellers. Supplier stock numbers are only used to
 * decide availability here — they are never sent to the buyer.
 */
export async function getShopCatalog(approved: boolean): Promise<ShopProduct[]> {
  const [publicProducts, pricingMap] = await Promise.all([getPublicProducts(500), getPricingMap(approved)]);
  const base = publicProducts.map((row) => toCatalogProduct(row, pricingMap));
  if (base.length === 0) return [];
  const colorResolver = await getColorResolver("en");

  const ids = base.map((p) => p.id);
  const sizes = new Map<string, Set<string>>();
  const colors = new Map<string, Set<string>>();
  const inStock = new Set<string>();
  const sales = new Map<string, number>();

  try {
    const service = createServiceRoleClient();
    const [{ data: variants }, { data: sold }] = await Promise.all([
      service.from("variants").select("product_id, size, color, stock").in("product_id", ids),
      service
        .from("order_items")
        .select("product_id, qty, item_status, orders!inner ( status )")
        .in("orders.status", SOLD_STATUSES)
        .in("item_status", ["available", "requested"])
        .limit(20000),
    ]);
    for (const v of variants ?? []) {
      if (Number(v.stock) <= 0) continue;
      inStock.add(v.product_id);
      if (v.size) (sizes.get(v.product_id) ?? sizes.set(v.product_id, new Set()).get(v.product_id)!).add(v.size);
      // filter facet = normalized TDP color id; unmapped supplier colors stay out until reviewed
      const colorId = colorResolver.id(v.color);
      if (colorId) (colors.get(v.product_id) ?? colors.set(v.product_id, new Set()).get(v.product_id)!).add(colorId);
    }
    for (const row of sold ?? []) {
      if (row.product_id) sales.set(row.product_id, (sales.get(row.product_id) ?? 0) + Number(row.qty));
    }
  } catch {
    // facets/ranking are best-effort; the catalog still renders
  }

  return base.map((p) => ({
    ...p,
    sizes: [...(sizes.get(p.id) ?? [])],
    colors: [...(colors.get(p.id) ?? [])],
    soldOut: !inStock.has(p.id),
    sales: sales.get(p.id) ?? 0,
  }));
}

/** Best Sellers, automatic: all-time sales among products with stock now; fills with newest. */
export function pickBestSellers(catalog: ShopProduct[], count: number): ShopProduct[] {
  const available = catalog.filter((p) => !p.soldOut);
  const ranked = [...available].filter((p) => p.sales > 0).sort((a, b) => b.sales - a.sales);
  const rest = available
    .filter((p) => p.sales === 0)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return [...ranked, ...rest].slice(0, count);
}

/** Manual module selection: keeps the given order, skips unknown/unavailable products. */
export function pickBySlugs(catalog: ShopProduct[], slugs: string[], count: number): ShopProduct[] {
  const bySlug = new Map(catalog.map((p) => [p.slug, p]));
  return slugs
    .map((slug) => bySlug.get(slug))
    .filter((p): p is ShopProduct => Boolean(p) && !p!.soldOut)
    .slice(0, count);
}
