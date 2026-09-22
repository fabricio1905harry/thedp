import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

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

/**
 * n8n automated ingestion endpoint.
 * Accepts raw supplier product data (with sizes/colors as comma-separated text or arrays).
 * Normalizes sizes/colors arrays, stores in products, and triggers price calculation
 * (original_price, price_brl, price_usd, price_eur) & size x color variant matrix generation.
 */
export async function POST(request: Request) {
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
    const isAuthorized =
      !!serviceKey &&
      ((apiKey && apiKey === serviceKey) ||
        (authHeader && authHeader.replace("Bearer ", "") === serviceKey));

    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized ingestion call" }, { status: 401 });
    }

    const rawBody = await request.json();
    const body =
      rawBody.data ??
      rawBody.json ??
      rawBody.product ??
      rawBody.payload ??
      rawBody.fields ??
      rawBody.record ??
      rawBody.body ??
      rawBody;

    const slug = body.slug || body.title?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (!slug) {
      return NextResponse.json({ error: "Product slug or title is required" }, { status: 400 });
    }

    const rawPrice = body.original_price ?? body.valor ?? body.price ?? 0;
    const originalPrice = Number(rawPrice);
    const markup = Number(body.markup ?? 0);

    const sizes = parseList(body.sizes ?? body.tamanhos ?? body.tamanho);
    const colors = parseList(body.colors ?? body.cores ?? body.cor);
    const defaultStock = Number(body.default_stock ?? body.stock ?? 0);

    const supabase = createServiceRoleClient();

    // Look up connector IDs if supplier names or IDs are passed
    const supplierInput = parseList(body.suppliers ?? body.supplier ?? body.fornecedor ?? body.fornecedores ?? body.supplier_name);
    let primaryConnectorId: string | null = body.connector_id || null;
    const connectorIdsToLink: string[] = [];

    if (supplierInput.length > 0) {
      const { data: matchedConnectors } = await supabase
        .from("connectors")
        .select("id, supplier_name")
        .in("supplier_name", supplierInput);

      if (matchedConnectors && matchedConnectors.length > 0) {
        if (!primaryConnectorId) {
          primaryConnectorId = matchedConnectors[0].id;
        }
        for (const c of matchedConnectors) {
          connectorIdsToLink.push(c.id);
        }
      }
    }

    // Parse image list across all common field names
    const imageList = parseList(
      body.images ??
        body.image ??
        body.image_url ??
        body.image_urls ??
        body.fotos ??
        body.foto ??
        body.foto_url ??
        body.foto_urls ??
        body.imagem ??
        body.imagens ??
        body.photo ??
        body.photos ??
        body.picture ??
        body.pictures ??
        body.storage_path ??
        body.source_url ??
        body.url ??
        body.urls ??
        body.link ??
        body.links
    );

    const primaryImageUrl = imageList[0] || body.source_url || null;

    const payload = {
      slug,
      title: body.title || slug,
      title_en: body.title_en || null,
      title_es: body.title_es || null,
      category: body.category || null,
      connector_id: primaryConnectorId,
      original_price: Number.isFinite(originalPrice) ? originalPrice : 0,
      markup: Number.isFinite(markup) ? markup : 0,
      sizes,
      colors,
      default_stock: Number.isFinite(defaultStock) && defaultStock >= 0 ? defaultStock : 0,
      status: body.status || "published",
      images: imageList,
      source_url: primaryImageUrl,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("products")
      .upsert(payload, { onConflict: "slug" })
      .select("id, slug, title, connector_id, original_price, markup, price_brl, price_usd, price_eur, sizes, colors, images, source_url")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Link suppliers in product_connectors junction table
    if (data && connectorIdsToLink.length > 0) {
      const links = connectorIdsToLink.map((cid) => ({
        product_id: data.id,
        connector_id: cid,
      }));
      await supabase.from("product_connectors").upsert(links, { onConflict: "product_id,connector_id" });
    }

    // Save image paths/urls into product_images table if passed
    if (data && imageList.length > 0) {
      await supabase.from("product_images").delete().eq("product_id", data.id);
      const imgRecords = imageList.map((imgUrl, idx) => ({
        product_id: data.id,
        storage_path: imgUrl,
        hash: `hash-${data.slug}-${idx}`,
        position: idx,
      }));
      await supabase.from("product_images").insert(imgRecords);
    }

    return NextResponse.json({
      success: true,
      product: data,
      linkedConnectors: connectorIdsToLink,
      imagesSaved: imageList.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
