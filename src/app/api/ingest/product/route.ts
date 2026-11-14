import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { applyLocks, type SyncableField } from "@/lib/product-sync";
import { isApiBlocked } from "@/lib/app-target";
import { timingSafeEqual } from "node:crypto";
import { IMPORT_DEFAULT_STOCK, looksLikeComposition, sentenceCase } from "@/lib/import-normalize";

/** Constant-time comparison of two keys (no early exit that would leak how much of the key matched). */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function parseList(input: unknown): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .map((item) => {
        if (!item) return "";
        if (typeof item === "string") return item.trim();
        if (typeof item === "object") {
          const obj = item as Record<string, unknown>;
          const val =
            obj.url ?? obj.src ?? obj.link ?? obj.storage_path ?? obj.image ?? obj.foto ?? obj.path ?? obj.href;
          return val ? String(val).trim() : "";
        }
        return String(item).trim();
      })
      .filter(Boolean);
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parseList(parsed);
      } catch {
        // Fallthrough to comma split
      }
    }
    return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function firstDefined(body: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (body[key] !== undefined && body[key] !== null) return body[key];
  }
  return undefined;
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

interface SourceVariantStock {
  size: string;
  color: string | null;
  stock: number;
}

function parseVariantStock(input: unknown): SourceVariantStock[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => {
      const r = (row ?? {}) as Record<string, unknown>;
      const size = String(r.size ?? r.tamanho ?? "").trim();
      const colorRaw = r.color ?? r.cor;
      const stock = toNumber(r.stock ?? r.estoque ?? r.qty);
      if (!size || stock === undefined) return null;
      return { size, color: colorRaw ? String(colorRaw).trim() : null, stock: Math.max(0, Math.floor(stock)) };
    })
    .filter((v): v is SourceVariantStock => v !== null);
}

/**
 * n8n automated ingestion endpoint (supplier sync).
 *
 * Sync rules:
 * - Only fields present in the payload are written, and never the ones the
 *   TDP edited by hand (products.locked_fields). The full supplier payload
 *   is kept in products.source_snapshot for "Reset to source".
 * - New products always land as DRAFT (Products to Review); an existing
 *   product's status is never changed by a sync.
 * - Images are only appended to products.images; the DB trigger adds new
 *   photos as PENDING REVIEW and never deletes, re-imports rejected ones or
 *   touches the approved gallery/cover (migration 0024).
 * - Per-variant supplier stock (payload `variants: [{size,color,stock}]`)
 *   goes to variants.source_stock; a manual override keeps winning until
 *   "Reset to Source Stock". Stock coming back on a variant with lost sales
 *   raises a Restock Opportunity (migration 0026).
 */
export async function POST(request: Request) {
  if (isApiBlocked("/api/ingest")) return new NextResponse("Not found", { status: 404 });
  try {
    const authHeader = request.headers.get("authorization");
    const apiKey = request.headers.get("x-api-key");
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Service key or bearer authorization check. No dev-mode bypass: `next
    // dev` binds to the LAN (see the "Network:" URL it prints), so an
    // env-based bypass would let anyone on that network write products
    // with zero credentials. Local test scripts already send the header
    // (see scripts/test-ingest-product-endpoint.mjs) so this doesn't
    // change the local testing workflow.
    // Accepted keys: INGEST_API_KEY (a key only for this import — the one n8n should use) or the Supabase
    // service-role key. Sent as `x-api-key: <key>` or `Authorization: Bearer <key>`.
    const ingestKey = process.env.INGEST_API_KEY;
    const provided = [apiKey, authHeader?.replace(/^Bearer\s+/i, "")].filter((v): v is string => Boolean(v && v.trim()));
    const accepted = [ingestKey, serviceKey].filter((v): v is string => Boolean(v && v.length >= 16));
    const isAuthorized = provided.some((p) => accepted.some((k) => safeEqual(p.trim(), k)));

    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized ingestion call" }, { status: 401 });
    }

    const rawBody = await request.json();
    const body = (rawBody.data ??
      rawBody.json ??
      rawBody.product ??
      rawBody.payload ??
      rawBody.fields ??
      rawBody.record ??
      rawBody.body ??
      rawBody) as Record<string, unknown>;

    const rawTitle = typeof body.title === "string" ? body.title : undefined;
    // P42: titles arrive as "VESTIDO CAPA"; the catalog uses sentence case
    const title = rawTitle !== undefined ? sentenceCase(rawTitle) : undefined;
    const slug =
      (typeof body.slug === "string" && body.slug) ||
      rawTitle?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (!slug) {
      return NextResponse.json({ error: "Product slug or title is required" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // ---- supplier values (only what the payload actually carries) ----
    const sourceValues: Partial<Record<SyncableField, unknown>> = {};
    if (title !== undefined) sourceValues.title = title;
    // P41: the category is never taken from the supplier: the TDP chooses it (it defines NCM, weight and
    // dimensions, see Admin → Categorias). The supplier's category is only kept in the snapshot.
    for (const key of ["title_en", "title_es", "description", "brand", "hs_code"] as const) {
      if (typeof body[key] === "string") sourceValues[key] = body[key];
    }
    // P44: the composition goes to "Material / composição" (used by the NCM rule), never to the description
    const compositionRaw = firstDefined(body, ["composition", "composicao", "composição", "material"]);
    let composition = typeof compositionRaw === "string" && compositionRaw.trim() ? compositionRaw.trim().slice(0, 300) : undefined;
    if (typeof sourceValues.description === "string" && looksLikeComposition(sourceValues.description)) {
      composition ??= sourceValues.description.trim();
      delete sourceValues.description;
    }
    const originalPrice = toNumber(firstDefined(body, ["original_price", "valor", "price"]));
    if (originalPrice !== undefined) sourceValues.original_price = originalPrice;
    const markup = toNumber(body.markup);
    if (markup !== undefined) sourceValues.markup = markup;
    const weight = toNumber(body.weight_g);
    if (weight !== undefined) sourceValues.weight_g = Math.round(weight);
    if (body.dims_cm && typeof body.dims_cm === "object") sourceValues.dims_cm = body.dims_cm;
    const sizesRaw = firstDefined(body, ["sizes", "tamanhos", "tamanho"]);
    if (sizesRaw !== undefined) sourceValues.sizes = parseList(sizesRaw);
    const colorsRaw = firstDefined(body, ["colors", "cores", "cor"]);
    if (colorsRaw !== undefined) sourceValues.colors = parseList(colorsRaw);

    const imageList = parseList(
      firstDefined(body, [
        "images", "image", "image_url", "image_urls", "fotos", "foto", "foto_url", "foto_urls",
        "imagem", "imagens", "photo", "photos", "picture", "pictures", "storage_path",
        "source_url", "url", "urls", "link", "links",
      ])
    );
    const variantStock = parseVariantStock(firstDefined(body, ["variants", "variantes", "stock_by_variant"]));

    // ---- suppliers ----
    const supplierInput = parseList(
      firstDefined(body, ["suppliers", "supplier", "fornecedor", "fornecedores", "supplier_name"])
    );
    let primaryConnectorId: string | null = typeof body.connector_id === "string" ? body.connector_id : null;
    const connectorIdsToLink: string[] = [];
    if (supplierInput.length > 0) {
      const { data: matchedConnectors } = await supabase
        .from("connectors")
        .select("id, supplier_name")
        .in("supplier_name", supplierInput);
      for (const c of matchedConnectors ?? []) {
        primaryConnectorId ??= c.id;
        connectorIdsToLink.push(c.id);
      }
    }

    const { data: existing } = await supabase
      .from("products")
      .select("id, images, locked_fields, source_snapshot, composition")
      .eq("slug", slug)
      .maybeSingle();

    const now = new Date().toISOString();
    const snapshot = {
      ...((existing?.source_snapshot as Record<string, unknown> | null) ?? {}),
      ...sourceValues,
      ...(typeof body.category === "string" ? { supplier_category: body.category } : {}),
      ...(composition ? { composition } : {}),
      ...(imageList.length > 0 ? { images: imageList } : {}),
    };

    let productId: string;
    let skippedLockedFields: string[] = [];

    if (existing) {
      const locked = (existing.locked_fields as string[] | null) ?? [];
      const writable = applyLocks(sourceValues, locked);
      skippedLockedFields = Object.keys(sourceValues).filter((f) => !(f in writable));

      // Append-only image list: previously known URLs stay in the array so
      // the trigger never sees them as missing (it never deletes anyway).
      const knownImages = parseList(existing.images);
      const mergedImages = [...knownImages, ...imageList.filter((u) => !knownImages.includes(u))];

      const { error } = await supabase
        .from("products")
        .update({
          ...writable,
          ...(primaryConnectorId ? { connector_id: primaryConnectorId } : {}),
          ...(imageList.length > 0 ? { images: mergedImages } : {}),
          // a composition the TDP already filled in is never replaced
          ...(composition && !String(existing.composition ?? "").trim() ? { composition } : {}),
          source_snapshot: snapshot,
          last_synced_at: now,
          updated_at: now,
        })
        .eq("id", existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      productId = existing.id;
    } else {
      // P45: imported products belong to the brand "The Dressing Project"
      const { data: tdpBrand } = await supabase
        .from("brands")
        .select("id, slug")
        .ilike("name", "the dressing project")
        .order("created_at")
        .limit(5);
      const brandId = (tdpBrand ?? []).sort((a, b) => Number(b.slug === "the-dressing-project") - Number(a.slug === "the-dressing-project"))[0]?.id ?? null;

      const { data: created, error } = await supabase
        .from("products")
        .insert({
          slug,
          title: title || slug,
          ...sourceValues,
          ...(composition ? { composition } : {}),
          brand_id: brandId,
          connector_id: primaryConnectorId,
          // P43: every new size × color combination starts with 500 (the TDP can change it per product)
          default_stock: IMPORT_DEFAULT_STOCK,
          // New supplier products always go to review first: publishing
          // needs at least one APPROVED image + cover (migration 0024).
          status: "draft",
          images: imageList,
          source_url: typeof body.source_url === "string" ? body.source_url : null,
          source_snapshot: snapshot,
          last_synced_at: now,
          updated_at: now,
        })
        .select("id")
        .single();
      if (error || !created) {
        return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
      }
      productId = created.id;
    }

    if (connectorIdsToLink.length > 0) {
      await supabase.from("product_connectors").upsert(
        connectorIdsToLink.map((cid) => ({ product_id: productId, connector_id: cid })),
        { onConflict: "product_id,connector_id" }
      );
    }

    // Supplier stock per color + size → source_stock (override still wins).
    let variantsUpdated = 0;
    for (const v of variantStock) {
      let query = supabase
        .from("variants")
        .update({ source_stock: v.stock })
        .eq("product_id", productId)
        .eq("size", v.size);
      query = v.color ? query.eq("color", v.color) : query.is("color", null);
      const { data } = await query.select("id");
      variantsUpdated += data?.length ?? 0;
    }

    const { data: product } = await supabase
      .from("products")
      .select("id, slug, title, status, connector_id, original_price, markup, price_brl, price_usd, price_eur, sizes, colors, locked_fields")
      .eq("id", productId)
      .single();

    const { count: pendingImages } = await supabase
      .from("product_images")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId)
      .eq("review_status", "pending_review");

    return NextResponse.json({
      success: true,
      created: !existing,
      product,
      linkedConnectors: connectorIdsToLink,
      skippedLockedFields,
      variantsStockUpdated: variantsUpdated,
      imagesPendingReview: pendingImages ?? 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
