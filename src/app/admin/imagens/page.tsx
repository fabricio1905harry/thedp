import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProductImagesManager, type ImageRow } from "@/components/product-images-manager";

const PAGE_SIZE = 120;

/**
 * Images to Review — the cross-product PENDING REVIEW queue the Action
 * Center card links to. Bulk APPROVE/REJECT SELECTED works across products.
 */
export default async function AdminImageQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { product } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("product_images")
    .select("id, product_id, storage_path, position, review_status, origin, is_cover, crop, replaces_image_id, created_at, products ( title )", { count: "exact" })
    .eq("review_status", "pending_review")
    .order("created_at", { ascending: true })
    .limit(PAGE_SIZE);
  if (product) query = query.eq("product_id", product);

  const { data, count } = await query;
  const images: ImageRow[] = (data ?? []).map((row) => ({
    ...(row as unknown as ImageRow),
    product_title: (row.products as unknown as { title: string } | null)?.title ?? null,
  }));

  return (
    <div>
      <h1 className="font-serif text-2xl mb-1">Images to Review — {count ?? 0}</h1>
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Supplier photos wait here as PENDING REVIEW and never reach the site until approved. Rejected photos
        are remembered and never re-imported. Approving does not change a product&apos;s cover.
        {product && (
          <>
            {" "}
            Filtered by one product — <Link href="/admin/imagens" className="underline">show all</Link>.
          </>
        )}
      </p>
      <ProductImagesManager images={images} mode="queue" />
      {(count ?? 0) > PAGE_SIZE && (
        <p className="text-xs text-muted mt-4">Showing the oldest {PAGE_SIZE}; approve/reject to load more.</p>
      )}
    </div>
  );
}
