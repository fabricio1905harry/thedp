"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";
import { changedFields, isSyncableField, type SyncableField } from "@/lib/product-sync";
import { parseCrop, type ImageCrop } from "@/lib/image-crop";

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

  if (error) {
    if (error.message.includes("PUBLISH_REQUIRES_COVER")) {
      throw new Error(
        "To publish, the product needs at least 1 APPROVED image set as MAIN IMAGE/COVER. Pending images do not block publishing."
      );
    }
    throw new Error(error.message);
  }
  revalidatePath("/admin/produtos");
}

/**
 * Permanently deletes one or more products (cascades variants, images,
 * connector links). Refuses to delete a product that already has orders
 * against it — archive it instead so order history stays intact.
 */
export async function deleteProducts(productIds: string[]) {
  await requireStaff();
  const supabase = await createClient();

  const { data: variantRows } = await supabase
    .from("variants")
    .select("id, product_id")
    .in("product_id", productIds);

  const variantIds = (variantRows ?? []).map((v) => v.id);
  const blockedProductIds = new Set<string>();

  if (variantIds.length > 0) {
    const { data: orderedVariants } = await supabase
      .from("order_items")
      .select("variant_id")
      .in("variant_id", variantIds);

    const orderedVariantIds = new Set((orderedVariants ?? []).map((o) => o.variant_id));
    for (const v of variantRows ?? []) {
      if (orderedVariantIds.has(v.id)) blockedProductIds.add(v.product_id);
    }
  }

  const deletableIds = productIds.filter((id) => !blockedProductIds.has(id));

  if (deletableIds.length > 0) {
    const { error } = await supabase.from("products").delete().in("id", deletableIds);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/admin/produtos");

  return {
    deletedCount: deletableIds.length,
    blockedCount: blockedProductIds.size,
  };
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

  const next: Partial<Record<SyncableField, unknown>> = {
    title: input.title,
    title_en: input.titleEn || null,
    title_es: input.titleEs || null,
    category: input.category,
    original_price: input.originalPrice,
    markup: input.markup,
    hs_code: input.hsCode || null,
    weight_g: input.weightG,
    dims_cm: input.dimsCm,
    sizes: input.sizes,
    colors: input.colors,
  };

  const { data: current, error: readError } = await supabase
    .from("products")
    .select("title, title_en, title_es, category, original_price, markup, hs_code, weight_g, dims_cm, sizes, colors, locked_fields")
    .eq("id", productId)
    .single();
  if (readError || !current) throw new Error(readError?.message ?? "Product not found");

  // Every field edited by hand is protected from the next syncs.
  const edited = changedFields(current as Partial<Record<SyncableField, unknown>>, next);
  const lockedFields = Array.from(new Set([...((current.locked_fields as string[]) ?? []), ...edited]));

  const { error } = await supabase
    .from("products")
    .update({
      ...next,
      connector_id: primaryConnectorId,
      default_stock: input.defaultStock,
      locked_fields: lockedFields,
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

/**
 * "Reset to source": drops the manual lock on the given fields and restores
 * the last value the supplier sent (products.source_snapshot). Fields the
 * supplier never sent keep their current value but sync again from now on.
 */
export async function resetFieldsToSource(productId: string, fields: string[]) {
  await requireStaff();
  const supabase = await createClient();
  const { data: product, error: readError } = await supabase
    .from("products")
    .select("locked_fields, source_snapshot")
    .eq("id", productId)
    .single();
  if (readError || !product) throw new Error(readError?.message ?? "Product not found");

  const toReset = fields.filter(isSyncableField);
  const snapshot = (product.source_snapshot as Record<string, unknown> | null) ?? {};
  const restored = Object.fromEntries(toReset.filter((f) => f in snapshot).map((f) => [f, snapshot[f]]));
  const lockedFields = ((product.locked_fields as string[]) ?? []).filter(
    (f) => !(toReset as string[]).includes(f)
  );

  const { error } = await supabase
    .from("products")
    .update({ ...restored, locked_fields: lockedFields, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) throw new Error(error.message);
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

/**
 * Manual stock/availability override per color + size. It wins over every
 * future sync until resetVariantStockToSource(); 0 = unavailable.
 */
export async function setVariantStock(variantId: string, stock: number) {
  const staff = await requireStaff();
  if (!Number.isInteger(stock) || stock < 0) {
    throw new Error("Stock must be a non-negative integer.");
  }
  const supabase = await createClient();
  const { error, data } = await supabase
    .from("variants")
    .update({ stock_override: stock, override_set_at: new Date().toISOString(), override_set_by: staff.id })
    .eq("id", variantId)
    .select("product_id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/produtos/${data.product_id}`);
}

/** "Reset to Source Stock/Availability": the supplier value applies again. */
export async function resetVariantStockToSource(variantIds: string[]) {
  await requireStaff();
  const supabase = await createClient();
  const { error, data } = await supabase
    .from("variants")
    .update({ stock_override: null, override_set_at: null, override_set_by: null })
    .in("id", variantIds)
    .select("product_id");
  if (error) throw new Error(error.message);
  for (const pid of new Set((data ?? []).map((v) => v.product_id))) {
    revalidatePath(`/admin/produtos/${pid}`);
  }
}

// ---------------------------------------------------------------------
// Image review (migration 0024). Supplier images enter as PENDING REVIEW;
// only APPROVED images reach the storefront. Supplier rows are never
// deleted — REJECTED/REPLACED rows are the memory that stops a future
// sync from importing the same photo again.
// ---------------------------------------------------------------------

export type ReviewStatus = "pending_review" | "approved" | "hidden" | "rejected";

function revalidateImages(productIds: Iterable<string>) {
  revalidatePath("/admin/imagens");
  revalidatePath("/admin");
  for (const pid of productIds) revalidatePath(`/admin/produtos/${pid}`);
}

async function nextPosition(supabase: Awaited<ReturnType<typeof createClient>>, productId: string) {
  const { data } = await supabase
    .from("product_images")
    .select("position")
    .eq("product_id", productId)
    .order("position", { ascending: false })
    .limit(1);
  return (data?.[0]?.position ?? -1) + 1;
}

/**
 * APPROVE / REJECT / HIDE / reactivate, for one or many images (bulk
 * APPROVE SELECTED / REJECT SELECTED). Approving never changes the cover.
 * The cover of a PUBLISHED product can't be hidden/rejected until another
 * cover is chosen (publishing requires an approved cover).
 */
export async function setImagesReviewStatus(imageIds: string[], status: ReviewStatus) {
  const staff = await requireStaff();
  if (imageIds.length === 0) return { updated: 0 };
  const supabase = await createClient();

  const { data: rows, error: readError } = await supabase
    .from("product_images")
    .select("id, product_id, is_cover, review_status, products ( status, title )")
    .in("id", imageIds);
  if (readError) throw new Error(readError.message);

  const editable = (rows ?? []).filter((r) => r.review_status !== "replaced");

  if (status !== "approved") {
    const blocked = editable.filter(
      (r) => r.is_cover && (r.products as unknown as { status: string } | null)?.status === "published"
    );
    if (blocked.length > 0) {
      const titles = blocked.map((r) => (r.products as unknown as { title: string } | null)?.title ?? r.product_id);
      throw new Error(
        `Choose another MAIN IMAGE/COVER first — this image is the cover of a published product: ${titles.join(", ")}`
      );
    }
    const covers = editable.filter((r) => r.is_cover).map((r) => r.id);
    if (covers.length > 0) {
      await supabase.from("product_images").update({ is_cover: false }).in("id", covers);
    }
  }

  const ids = editable.map((r) => r.id);
  const { error } = await supabase
    .from("product_images")
    .update({ review_status: status, reviewed_at: new Date().toISOString(), reviewed_by: staff.id })
    .in("id", ids);
  if (error) throw new Error(error.message);

  revalidateImages(new Set(editable.map((r) => r.product_id)));
  return { updated: ids.length };
}

/** MAIN IMAGE / COVER — must be an approved image. */
export async function setCoverImage(imageId: string) {
  await requireStaff();
  const supabase = await createClient();
  const { data: img, error } = await supabase
    .from("product_images")
    .select("id, product_id, review_status")
    .eq("id", imageId)
    .single();
  if (error || !img) throw new Error(error?.message ?? "Image not found");
  if (img.review_status !== "approved") throw new Error("Only an APPROVED image can be the cover.");

  await supabase.from("product_images").update({ is_cover: false }).eq("product_id", img.product_id).eq("is_cover", true);
  const { error: setError } = await supabase.from("product_images").update({ is_cover: true }).eq("id", imageId);
  if (setError) throw new Error(setError.message);
  revalidateImages([img.product_id]);
}

/** Reorder: positions follow the given id order. */
export async function reorderProductImages(productId: string, orderedIds: string[]) {
  await requireStaff();
  const supabase = await createClient();
  await Promise.all(
    orderedIds.map((id, idx) =>
      supabase.from("product_images").update({ position: idx }).eq("id", id).eq("product_id", productId)
    )
  );
  revalidateImages([productId]);
}

/** Adjust/crop to the 2:3 standard (null = show full photo, no crop). */
export async function setImageCrop(imageId: string, crop: ImageCrop | null) {
  await requireStaff();
  const parsed = crop === null ? null : parseCrop(crop);
  if (crop !== null && !parsed) throw new Error("Invalid crop.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_images")
    .update({ crop: parsed })
    .eq("id", imageId)
    .select("product_id")
    .single();
  if (error) throw new Error(error.message);
  revalidateImages([data.product_id]);
}

async function insertTdpImage(
  productId: string,
  url: string,
  replacesImageId: string | null,
  staffId: string
) {
  const supabase = await createClient();

  if (!replacesImageId) {
    const { error } = await supabase.from("product_images").insert({
      product_id: productId,
      storage_path: url,
      hash: `tdp-${Date.now()}`,
      position: await nextPosition(supabase, productId),
      origin: "tdp_upload",
      review_status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: staffId,
    });
    if (error) throw new Error(error.message);
    return;
  }

  // REPLACE: SOURCE IMAGE → TDP VERSION. The TDP version takes the source's
  // place (position + cover); the source row stays as REPLACED so the next
  // sync recognises that photo as already treated.
  const { data: source, error: srcError } = await supabase
    .from("product_images")
    .select("id, product_id, position, is_cover")
    .eq("id", replacesImageId)
    .single();
  if (srcError || !source) throw new Error(srcError?.message ?? "Original image not found");

  await supabase
    .from("product_images")
    .update({ is_cover: false, review_status: "replaced", reviewed_at: new Date().toISOString(), reviewed_by: staffId })
    .eq("id", source.id);

  const { error } = await supabase.from("product_images").insert({
    product_id: source.product_id,
    storage_path: url,
    hash: `tdp-${Date.now()}`,
    position: source.position,
    origin: "tdp_upload",
    review_status: "approved",
    replaces_image_id: source.id,
    is_cover: source.is_cover,
    reviewed_at: new Date().toISOString(),
    reviewed_by: staffId,
  });
  if (error) throw new Error(error.message);
}

/** TDP's own image (or a treated replacement) by URL. */
export async function addProductImage(productId: string, storagePath: string, replacesImageId?: string) {
  const staff = await requireStaff();
  const path = storagePath.trim();
  if (!path) throw new Error("Image URL cannot be empty.");
  await insertTdpImage(productId, path, replacesImageId ?? null, staff.id);
  revalidateImages([productId]);
}

/** Upload a file to the tdp-images bucket (optionally replacing a source image). */
export async function uploadProductImage(formData: FormData) {
  const staff = await requireStaff();
  const productId = String(formData.get("productId") ?? "");
  const replacesImageId = (formData.get("replacesImageId") as string | null) || null;
  const file = formData.get("file");
  if (!productId || !(file instanceof File) || file.size === 0) throw new Error("Choose an image file.");
  if (!file.type.startsWith("image/")) throw new Error("Only image files can be uploaded.");

  const service = createServiceRoleClient();
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const objectPath = `products/${productId}/${Date.now()}.${ext}`;
  const { error: uploadError } = await service.storage
    .from("tdp-images")
    .upload(objectPath, file, { contentType: file.type, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrl } = service.storage.from("tdp-images").getPublicUrl(objectPath);
  await insertTdpImage(productId, publicUrl.publicUrl, replacesImageId, staff.id);
  revalidateImages([productId]);
}

/**
 * Deletes a TDP upload. Supplier images can't be deleted — REJECT them, so
 * the sync remembers not to bring them back.
 */
export async function removeProductImage(imageId: string, productId: string) {
  await requireStaff();
  const supabase = await createClient();
  const { data: img } = await supabase
    .from("product_images")
    .select("origin, is_cover, products ( status )")
    .eq("id", imageId)
    .single();
  if (!img) throw new Error("Image not found");
  if (img.origin !== "tdp_upload") {
    throw new Error("Supplier images can't be deleted — reject them instead so they never come back in a sync.");
  }
  if (img.is_cover && (img.products as unknown as { status: string } | null)?.status === "published") {
    throw new Error("Choose another MAIN IMAGE/COVER before deleting this one.");
  }
  const { error } = await supabase.from("product_images").delete().eq("id", imageId);
  if (error) throw new Error(error.message);
  revalidateImages([productId]);
}

/**
 * Re-runs the image import from products.images for the given products.
 * Same non-destructive rules as the DB trigger (it simply re-fires it).
 */
export async function syncProductImagesAction(productIds?: string[]) {
  await requireStaff();
  const supabase = await createClient();

  let query = supabase.from("products").select("id, images");
  if (productIds && productIds.length > 0) query = query.in("id", productIds);
  const { data: products, error } = await query;
  if (error) throw new Error(error.message);

  for (const prod of products ?? []) {
    await supabase.from("products").update({ images: prod.images }).eq("id", prod.id);
  }

  revalidatePath("/admin/produtos");
  return { success: true, syncedCount: products?.length ?? 0, skippedCount: 0 };
}
