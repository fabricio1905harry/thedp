import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProductEditForm } from "@/components/product-edit-form";
import { VariantStockTable } from "@/components/variant-stock-table";
import { ProductImagesManager, type ImageRow } from "@/components/product-images-manager";
import { SyncLocksPanel } from "@/components/sync-locks-panel";
import { ProductPricingPanel, type MarginInfo, type ProductPricingData } from "@/components/product-pricing-panel";
import { ProductRegistrationForm, type RegistrationData } from "@/components/product-registration-form";

export default async function AdminProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select(
      "id, title, title_en, title_es, category, status, is_featured, connector_id, original_price, markup, price_brl, price_usd, price_eur, extra_cost_brl, margin_pct_override, commission_pct_override, price_adjust_pct, retail_usd, retail_eur, manual_price_usd, manual_price_eur, description, description_en, description_es, composition, origin_country, ncm, supplier_ref, tdp_ref, customs_description, visible_ops, hs_code, weight_g, dims_cm, sizes, colors, default_stock, locked_fields, last_synced_at, source_snapshot"
    )
    .eq("id", id)
    .single();

  if (!product) notFound();

  const { data: marginInfo } = await supabase.rpc("tdp_product_margin", { p_product: id });

  const { data: variants } = await supabase
    .from("variants")
    .select("id, size, size_br, size_us, size_eu, color, sku, stock, source_stock, stock_override")
    .eq("product_id", id)
    .order("size");

  const { data: images } = await supabase
    .from("product_images")
    .select("id, product_id, storage_path, position, review_status, origin, is_cover, crop, replaces_image_id")
    .eq("product_id", id)
    .order("position");

  const { data: connectors } = await supabase
    .from("connectors")
    .select("id, supplier_name, status, included_in_contract")
    .order("supplier_name");

  const { data: linkedConnectors } = await supabase
    .from("product_connectors")
    .select("connector_id")
    .eq("product_id", id);

  const initialConnectorIds = (linkedConnectors ?? []).map((lc) => lc.connector_id);
  if (product.connector_id && !initialConnectorIds.includes(product.connector_id)) {
    initialConnectorIds.push(product.connector_id);
  }

  return (
    <div>
      <Link href="/admin/produtos" className="text-xs text-muted hover:text-accent">
        ← Produtos
      </Link>
      <h1 className="font-serif text-2xl mt-2 mb-6">{product.title}</h1>

      <SyncLocksPanel
        productId={id}
        lockedFields={(product.locked_fields as string[]) ?? []}
        lastSyncedAt={product.last_synced_at}
        sourceSnapshot={product.source_snapshot as Record<string, unknown> | null}
      />

      <h2 className="text-sm font-medium uppercase tracking-wide mb-4">Fotos</h2>
      <div className="mb-10">
        <ProductImagesManager productId={id} images={(images ?? []) as ImageRow[]} />
      </div>

      <ProductEditForm
        product={product}
        connectors={connectors ?? []}
        initialConnectorIds={initialConnectorIds}
      />

      <ProductRegistrationForm product={product as unknown as RegistrationData} />

      <ProductPricingPanel product={product as unknown as ProductPricingData} margin={(marginInfo as MarginInfo | null) ?? null} />

      <h2 className="text-sm font-medium uppercase tracking-wide mt-10 mb-4">
        Estoque por variante (matriz tamanho × cor)
      </h2>
      <VariantStockTable variants={variants ?? []} />
    </div>
  );
}
