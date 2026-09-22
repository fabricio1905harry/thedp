"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";

async function requireStaff() {
  const staff = await getCurrentStaff();
  if (!staff) throw new Error("Not authorized");
  return staff;
}

/** ADM-02/CAT-04: individual or bulk publish/unpublish/archive. */
export async function setProductStatus(
  productIds: string[],
  status: "draft" | "published" | "archived"
) {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", productIds);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/produtos");
}

export interface UpdateProductInput {
  title: string;
  titleEn: string;
  titleEs: string;
  category: string;
  originalPrice: number;
  markup: number;
  hsCode: string;
  weightG: number | null;
  dimsCm: { length: number | null; width: number | null; height: number | null };
  sizes: string[];
  colors: string[];
  defaultStock: number;
  connectorId?: string | null;
  connectorIds?: string[];
}

/**
 * ADM-03: edit price, markup, HS code, suppliers, and measurements, plus the raw
 * supplier size/color lists. price_brl/usd/eur and the variants matrix are
 * NOT computed here — the products_compute_prices and
 * products_generate_variants triggers own that (see migration 0005).
 */
export async function updateProduct(productId: string, input: UpdateProductInput) {
  await requireStaff();
  const supabase = await createClient();

  const primaryConnectorId = input.connectorId || (input.connectorIds?.[0] ?? null);

  const { error } = await supabase
    .from("products")
    .update({
      title: input.title,
      title_en: input.titleEn || null,
      title_es: input.titleEs || null,
      category: input.category,
      connector_id: primaryConnectorId,
      original_price: input.originalPrice,
      markup: input.markup,
      hs_code: input.hsCode || null,
      weight_g: input.weightG,
      dims_cm: input.dimsCm,
      sizes: input.sizes,
      colors: input.colors,
      default_stock: input.defaultStock,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId);

  if (error) throw new Error(error.message);

  if (input.connectorIds !== undefined) {
    await supabase.from("product_connectors").delete().eq("product_id", productId);
    if (input.connectorIds.length > 0) {
      const links = input.connectorIds.map((cid) => ({
        product_id: productId,
        connector_id: cid,
      }));
      await supabase.from("product_connectors").insert(links);
    }
  }

  revalidatePath("/admin/produtos");
  revalidatePath(`/admin/produtos/${productId}`);
}

export async function setProductFeatured(productId: string, isFeatured: boolean) {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ is_featured: isFeatured })
    .eq("id", productId);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/produtos");
  revalidatePath(`/admin/produtos/${productId}`);
}

/** Per-variant stock, since the matrix generator only sets a default on creation. */
export async function setVariantStock(variantId: string, stock: number) {
  await requireStaff();
  if (!Number.isInteger(stock) || stock < 0) {
    throw new Error("Stock must be a non-negative integer.");
  }
  const supabase = await createClient();
  const { error, data } = await supabase
    .from("variants")
    .update({ stock })
    .eq("id", variantId)
    .select("product_id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/produtos/${data.product_id}`);
}

/**
 * Sync images array from products table into product_images table,
 * skipping any images that already exist for that product.
 */
export async function syncProductImagesAction(productIds?: string[]) {
  await requireStaff();
  const supabase = await createClient();

  let query = supabase.from("products").select("id, slug, images, source_url");
  if (productIds && productIds.length > 0) {
    query = query.in("id", productIds);
  }

  const { data: products, error } = await query;
  if (error) throw new Error(error.message);

  let totalSynced = 0;
  let totalSkipped = 0;

  for (const prod of products ?? []) {
    let imgList: string[] = [];

    if (Array.isArray(prod.images)) {
      imgList = prod.images.map((item) => String(item).trim()).filter(Boolean);
    } else if (typeof prod.images === "string" && prod.images.trim()) {
      try {
        const parsed = JSON.parse(prod.images);
        if (Array.isArray(parsed)) {
          imgList = parsed.map((item) => String(item).trim()).filter(Boolean);
        } else {
          imgList = [prod.images.trim()];
        }
      } catch {
        imgList = [prod.images.trim()];
      }
    }

    if (imgList.length === 0 && prod.source_url) {
      imgList = [prod.source_url.trim()];
    }

    if (imgList.length === 0) continue;

    // Fetch existing images for this product
    const { data: existingImages } = await supabase
      .from("product_images")
      .select("storage_path")
      .eq("product_id", prod.id);

    const existingPaths = new Set(
      (existingImages ?? []).map((img) => img.storage_path.trim())
    );

    const newRecordsToInsert = [];
    let pos = (existingImages?.length ?? 0);

    for (const imgUrl of imgList) {
      if (!existingPaths.has(imgUrl)) {
        newRecordsToInsert.push({
          product_id: prod.id,
          storage_path: imgUrl,
          hash: `hash-${prod.slug}-${pos}`,
          position: pos,
        });
        existingPaths.add(imgUrl);
        pos++;
      } else {
        totalSkipped++;
      }
    }

    if (newRecordsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("product_images")
        .insert(newRecordsToInsert);

      if (!insertError) {
        totalSynced += newRecordsToInsert.length;
      }
    }
  }

  revalidatePath("/admin/produtos");
  return { success: true, syncedCount: totalSynced, skippedCount: totalSkipped };
}

