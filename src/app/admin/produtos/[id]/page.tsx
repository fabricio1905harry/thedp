import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProductEditForm } from "@/components/product-edit-form";
import { VariantStockTable } from "@/components/variant-stock-table";

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
      "id, title, title_en, title_es, category, status, is_featured, connector_id, original_price, markup, price_brl, price_usd, price_eur, hs_code, weight_g, dims_cm, sizes, colors, default_stock"
    )
    .eq("id", id)
    .single();

  if (!product) notFound();

  const { data: variants } = await supabase
    .from("variants")
    .select("id, size, size_br, size_us, size_eu, color, sku, stock")
    .eq("product_id", id)
    .order("size");

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
        ← Products
      </Link>
      <h1 className="font-serif text-2xl mt-2 mb-6">{product.title}</h1>
      <ProductEditForm
        product={product}
        connectors={connectors ?? []}
        initialConnectorIds={initialConnectorIds}
      />

      <h2 className="text-sm font-medium uppercase tracking-wide mt-10 mb-4">
        Variant stock (size × color matrix)
      </h2>
      <VariantStockTable variants={variants ?? []} />
    </div>
  );
}
