import { cache } from "react";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { pickLocale } from "@/lib/cms-types";
import { currentOperation } from "@/lib/operation";
import { normalizeImageUrl } from "@/lib/image-url";
import { getShopCatalog, type ShopProduct } from "@/lib/catalog";
import type { SizeChartRow } from "@/lib/size-format";

/**
 * Catalog phase 2 (migrations 0050–0053): brands, collections, lookbooks,
 * TDP edits and the size chart. Visibility (active + the collection's own
 * schedule) is enforced by RLS on the anon/authenticated client and the
 * operation by `visible_ops`. A paid placement that ended only loses its paid
 * highlight (partner label, featured spot): the item itself stays on the site.
 */

const hasDb = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const hasService = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export interface EntityCard {
  id: string;
  slug: string;
  title: string;
  text: string;
  coverUrl: string | null;
  /** mobile cover (falls back to the desktop one) */
  coverMobileUrl?: string | null;
  logoUrl?: string | null;
  /** lookbooks: related brand / collection */
  brandId?: string | null;
  collectionId?: string | null;
  /** edits: editorial images */
  gallery?: string[];
  country?: string | null;
  featured: boolean;
  /** Paid placement label (partner name) — shown as "Partner" on the cards. */
  partner: string | null;
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** The paid highlight is only in force inside its window (start ≤ today ≤ end). */
function placementInForce(row: Row): boolean {
  if (!row.paid_placement) return false;
  const today = new Date().toISOString().slice(0, 10);
  const start = str(row.placement_start);
  const end = str(row.placement_end);
  return (!start || start <= today) && (!end || end >= today);
}

function card(row: Row, locale: string, kind: "brands" | "collections" | "lookbooks" | "edits"): EntityCard {
  const textKey = kind === "edits" ? "body" : "story";
  const paid = placementInForce(row);
  return {
    id: str(row.id),
    slug: str(row.slug),
    title: kind === "brands" ? str(row.name) : pickLocale(row.title, locale),
    text: pickLocale(row[textKey], locale),
    coverUrl: normalizeImageUrl(str(row.cover_url) || null, 1600),
    coverMobileUrl: normalizeImageUrl(str(row.cover_mobile_url) || null, 1000),
    brandId: str(row.brand_id) || null,
    collectionId: str(row.collection_id) || null,
    gallery: Array.isArray(row.gallery) ? (row.gallery as unknown[]).map((u) => normalizeImageUrl(str(u) || null, 1800) ?? "").filter(Boolean) : [],
    logoUrl: normalizeImageUrl(str(row.logo_url) || null, 600),
    country: str(row.country) || null,
    // a paid highlight that is out of its window no longer counts as featured nor shows the partner
    featured: Boolean(row.featured) && (!row.paid_placement || paid),
    partner: paid ? str(row.partner) || null : null,
  };
}

const COLUMNS: Record<"brands" | "collections" | "lookbooks" | "edits", { table: string; select: string }> = {
  brands: { table: "brands", select: "id, slug, name, logo_url, cover_url, cover_mobile_url, story, country, featured, sort, partner, paid_placement, placement_start, placement_end" },
  collections: { table: "collections", select: "id, slug, title, story, cover_url, cover_mobile_url, featured, sort, partner, paid_placement, placement_start, placement_end" },
  lookbooks: { table: "lookbooks", select: "id, slug, title, story, cover_url, cover_mobile_url, brand_id, collection_id, featured, sort, partner, paid_placement, placement_start, placement_end" },
  edits: { table: "tdp_edits", select: "id, slug, title, body, cover_url, cover_mobile_url, gallery, featured, sort, partner, paid_placement, placement_start, placement_end" },
};

const LEGACY_SELECT: Record<keyof typeof COLUMNS, string> = {
  brands: "id, slug, name, logo_url, cover_url, story, country, featured, sort, partner, paid_placement, placement_start, placement_end",
  collections: "id, slug, title, story, cover_url, featured, sort, partner, paid_placement, placement_start, placement_end",
  lookbooks: "id, slug, title, story, cover_url, featured, sort, partner, paid_placement, placement_start, placement_end",
  edits: "id, slug, title, body, cover_url, featured, sort, partner, paid_placement, placement_start, placement_end",
};

export async function listEntities(
  kind: keyof typeof COLUMNS,
  locale: string,
  opts: { featuredOnly?: boolean; limit?: number } = {}
): Promise<EntityCard[]> {
  if (!hasDb()) return [];
  try {
    const supabase = await createClient();
    const op = await currentOperation();
    const build = (select: string, withOps: boolean) => {
      let q = supabase.from(COLUMNS[kind].table).select(select);
      if (withOps) q = q.contains("visible_ops", [op]);
      q = q.order("sort").order("created_at", { ascending: false });
      return opts.featuredOnly ? q.eq("featured", true) : q;
    };
    // the placement window is checked below, so the limit is applied after it
    let res = await build(COLUMNS[kind].select, true);
    // migration 0086 adds the new columns: until it is applied keep serving the previous ones
    if (res.error) res = await build(LEGACY_SELECT[kind], false);
    const data = res.data;
    let cards = ((data ?? []) as unknown as Row[]).map((r) => card(r, locale, kind));
    if (opts.featuredOnly) cards = cards.filter((c) => c.featured);
    return opts.limit ? cards.slice(0, opts.limit) : cards;
  } catch {
    return [];
  }
}

export async function getEntityBySlug(kind: keyof typeof COLUMNS, slug: string, locale: string): Promise<EntityCard | null> {
  if (!hasDb()) return null;
  try {
    const supabase = await createClient();
    const op = await currentOperation();
    let res = await supabase.from(COLUMNS[kind].table).select(COLUMNS[kind].select).eq("slug", slug).contains("visible_ops", [op]).maybeSingle();
    if (res.error) res = (await supabase.from(COLUMNS[kind].table).select(LEGACY_SELECT[kind]).eq("slug", slug).maybeSingle()) as unknown as typeof res;
    return res.data ? card(res.data as unknown as Row, locale, kind) : null;
  } catch {
    return null;
  }
}

/** Menu entries: BRANDS / COLLECTIONS / LOOKBOOKS / EDITS appear only when something is active and visible. */
export const getNavAvailability = cache(async () => {
  const none = { brands: false, collections: false, lookbooks: false, edits: false };
  if (!hasDb()) return none;
  try {
    const supabase = await createClient();
    const count = async (table: string) => {
      const { count: n } = await supabase.from(table).select("id", { count: "exact", head: true });
      return (n ?? 0) > 0;
    };
    const [brands, collections, lookbooks, edits] = await Promise.all([
      count("brands"),
      count("collections"),
      count("lookbooks"),
      count("tdp_edits"),
    ]);
    return { brands, collections, lookbooks, edits };
  } catch {
    return none;
  }
});

/** Product ids linked to an entity, in the curated order. */
export async function entityProductIds(kind: "brands" | "collections" | "edits", id: string): Promise<string[]> {
  if (!hasService()) return [];
  const service = createServiceRoleClient();
  if (kind === "brands") {
    const { data } = await service.from("products").select("id").eq("brand_id", id).eq("status", "published").order("created_at", { ascending: false });
    return (data ?? []).map((r) => r.id as string);
  }
  const table = kind === "collections" ? "collection_products" : "tdp_edit_products";
  const fk = kind === "collections" ? "collection_id" : "edit_id";
  const { data } = await service.from(table).select("product_id").eq(fk, id).order("sort");
  return (data ?? []).map((r) => r.product_id as string);
}

/** Catalog products (with buyer pricing rules applied) for a list of ids, keeping the given order. */
export async function productsByIds(ids: string[], approved: boolean): Promise<ShopProduct[]> {
  if (ids.length === 0) return [];
  const catalog = await getShopCatalog(approved);
  const byId = new Map(catalog.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is ShopProduct => Boolean(p));
}

export interface LookbookImage {
  id: string;
  imageUrl: string;
  caption: string;
  products: ShopProduct[];
}

export async function getLookbookImages(lookbookId: string, locale: string, approved: boolean): Promise<LookbookImage[]> {
  if (!hasDb()) return [];
  const supabase = await createClient();
  const { data: images } = await supabase
    .from("lookbook_images")
    .select("id, image_url, caption, sort")
    .eq("lookbook_id", lookbookId)
    .order("sort");
  if (!images || images.length === 0) return [];
  const { data: links } = await supabase
    .from("lookbook_image_products")
    .select("image_id, product_id, sort")
    .in("image_id", images.map((i) => i.id))
    .order("sort");
  const catalog = await getShopCatalog(approved);
  const byId = new Map(catalog.map((p) => [p.id, p]));
  return images.map((img) => ({
    id: img.id,
    imageUrl: normalizeImageUrl(img.image_url, 1800) ?? "",
    caption: pickLocale(img.caption, locale),
    products: (links ?? [])
      .filter((l) => l.image_id === img.id)
      .map((l) => byId.get(l.product_id))
      .filter((p): p is ShopProduct => Boolean(p)),
  }));
}

/** Brand of a product (only when the brand is active and visible). */
export async function getProductBrand(productId: string): Promise<{ slug: string; name: string } | null> {
  if (!hasDb() || !hasService()) return null;
  try {
    const service = createServiceRoleClient();
    const { data: p } = await service.from("products").select("brand_id").eq("id", productId).maybeSingle();
    if (!p?.brand_id) return null;
    const supabase = await createClient();
    const { data: brand } = await supabase.from("brands").select("slug, name").eq("id", p.brand_id).maybeSingle();
    return brand ? { slug: brand.slug, name: brand.name } : null;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------- size chart
export const getSizeChart = cache(async (locale: string): Promise<SizeChartRow[]> => {
  if (!hasDb()) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("size_chart").select("*").order("sort");
    return (data ?? []).map((r) => ({
      id: r.id,
      size_br: r.size_br,
      size_us: r.size_us,
      size_eu: r.size_eu,
      letter: r.letter,
      aliases: r.aliases ?? [],
      bust_cm: r.bust_cm,
      waist_cm: r.waist_cm,
      hip_cm: r.hip_cm,
      note: (locale === "es" ? r.note_es : locale === "pt" ? r.note_pt : r.note_en) || r.note_en || "",
    }));
  } catch {
    return [];
  }
});

// ------------------------------------------------------ favorites / notify
export async function getFavoriteProductIds(customerId: string): Promise<string[]> {
  if (!hasDb()) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("favorites").select("product_id").eq("customer_id", customerId).order("created_at", { ascending: false });
    return (data ?? []).map((r) => r.product_id as string);
  } catch {
    return [];
  }
}

export async function getNotifyVariantIds(customerId: string, productId: string): Promise<string[]> {
  if (!hasDb()) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("notify_requests")
      .select("variant_id")
      .eq("customer_id", customerId)
      .eq("product_id", productId)
      .is("notified_at", null);
    return (data ?? []).map((r) => r.variant_id as string);
  } catch {
    return [];
  }
}

/** Brands selected for a TDP edit (active and visible only). */
export async function getEditBrands(editId: string): Promise<{ slug: string; name: string }[]> {
  if (!hasDb()) return [];
  try {
    const supabase = await createClient();
    const { data: links } = await supabase.from("tdp_edit_brands").select("brand_id, sort").eq("edit_id", editId).order("sort");
    const ids = (links ?? []).map((l) => l.brand_id as string);
    if (ids.length === 0) return [];
    const { data: brands } = await supabase.from("brands").select("id, slug, name").in("id", ids);
    const byId = new Map((brands ?? []).map((b) => [b.id as string, b]));
    return ids.map((id) => byId.get(id)).filter((b): b is NonNullable<typeof b> => Boolean(b)).map((b) => ({ slug: b.slug as string, name: b.name as string }));
  } catch {
    return [];
  }
}

/** Brand / collection a lookbook is tied to (active and visible only). */
export async function getLookbookLinks(brandId: string | null, collectionId: string | null, locale: string) {
  const out: { brand: { slug: string; name: string } | null; collection: { slug: string; title: string } | null } = { brand: null, collection: null };
  if (!hasDb()) return out;
  try {
    const supabase = await createClient();
    if (brandId) {
      const { data } = await supabase.from("brands").select("slug, name").eq("id", brandId).maybeSingle();
      if (data) out.brand = { slug: data.slug as string, name: data.name as string };
    }
    if (collectionId) {
      const { data } = await supabase.from("collections").select("slug, title").eq("id", collectionId).maybeSingle();
      if (data) out.collection = { slug: data.slug as string, title: pickLocale(data.title, locale) };
    }
  } catch {
    // links are optional decoration
  }
  return out;
}
