import { createClient } from "@/lib/supabase/server";
import { ProductModerationTable } from "@/components/product-moderation-table";

async function getProducts() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("products")
      .select(`
        id, title, category, status, price_brl, connector_id,
        connectors ( supplier_name ),
        product_connectors ( connector_id, connectors ( supplier_name ) )
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    return (data ?? []).map((p) => {
      const supplierNames: string[] = [];
      if (p.connectors && typeof p.connectors === "object" && "supplier_name" in p.connectors) {
        supplierNames.push((p.connectors as { supplier_name: string }).supplier_name);
      }
      if (Array.isArray(p.product_connectors)) {
        for (const pc of p.product_connectors) {
          if (pc.connectors && typeof pc.connectors === "object" && "supplier_name" in pc.connectors) {
            const name = (pc.connectors as { supplier_name: string }).supplier_name;
            if (!supplierNames.includes(name)) {
              supplierNames.push(name);
            }
          }
        }
      }
      return {
        id: p.id,
        title: p.title,
        category: p.category,
        status: p.status,
        price_brl: p.price_brl,
        suppliers: supplierNames,
      };
    });
  } catch {
    return null;
  }
}

export default async function AdminProdutosPage() {
  const products = await getProducts();

  return (
    <div>
      <h1 className="font-serif text-2xl mb-2">Products</h1>
      <p className="text-sm text-muted mb-6">
        Individual and bulk publish/unpublish (CAT-04), price/markup/HS code
        editing (ADM-03). Catalog volume itself is still blocked on the n8n
        supplier connectors (task #10).
      </p>
      {products === null ? (
        <p className="text-sm text-muted">Could not load products.</p>
      ) : products.length === 0 ? (
        <p className="text-sm text-muted">
          No products yet — automated ingestion (CAT-01) is blocked until the
          5 suppliers are chosen (PRD pending decision #4).
        </p>
      ) : (
        <ProductModerationTable products={products} />
      )}
    </div>
  );
}
