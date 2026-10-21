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
      <h1 className="font-serif text-2xl mb-1">Imagens para revisar — {count ?? 0}</h1>
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Fotos do fornecedor aguardam aqui como AGUARDANDO REVISÃO e só chegam ao site depois de aprovadas. Fotos
        rejeitadas são lembradas e nunca reimportadas. Aprovar não altera a capa do produto.
        {product && (
          <>
            {" "}
            Filtrado por um produto — <Link href="/admin/imagens" className="underline">mostrar todas</Link>.
          </>
        )}
      </p>
      <ProductImagesManager images={images} mode="queue" />
      {(count ?? 0) > PAGE_SIZE && (
        <p className="text-xs text-muted mt-4">Mostrando as {PAGE_SIZE} mais antigas; aprove/rejeite para carregar mais.</p>
      )}
    </div>
  );
}
