import { createClient } from "@/lib/supabase/server";
import { CategoriesAdmin, type CategoryRow, type SupplierWeightRow } from "@/components/categories-admin";

export const metadata = { title: "Categorias — Admin" };

/** Categories and subcategories: the base of the fiscal (NCM / HS) and freight (weight / dimensions) data of the products. */
export default async function AdminCategoriesPage() {
  const supabase = await createClient();
  const [cats, { data: connectors }, sup, { data: products }] = await Promise.all([
    supabase.from("category_shipping_defaults").select("category, name_en, name_es, parent_category, ncm, hs_code, weight_g, dims_cm, active, sort").order("sort").order("category"),
    supabase.from("connectors").select("id, supplier_name").order("supplier_name"),
    supabase.from("category_supplier_defaults").select("category, connector_id, weight_g, dims_cm"),
    supabase.from("products").select("category").neq("status", "archived").limit(10000),
  ]);
  const counts: Record<string, number> = {};
  for (const p of products ?? []) {
    const c = (p.category as string | null)?.trim();
    if (c) counts[c] = (counts[c] ?? 0) + 1;
  }
  const missing = cats.error ? "Rode as migrations 0088, 0089 e 0090 no Supabase para usar esta tela." : null;

  return (
    <div className="max-w-6xl space-y-5">
      <div>
        <h1 className="font-serif text-2xl mb-1">Categorias</h1>
        <p className="text-sm text-muted max-w-3xl">
          Cada categoria (e subcategoria) define o NCM, o HS, o peso e as medidas da peça embalada. Ao escolher a categoria no cadastro do produto, esses dados vão
          automaticamente para ele e são a base do frete, dos impostos e da commercial invoice. A subcategoria usa os dados da categoria-mãe no que estiver vazio.
          Um valor digitado no próprio produto nunca é substituído. O peso por fornecedor vale mais que o da categoria.
        </p>
      </div>
      {missing ? (
        <p className="text-sm text-red-700">{missing}</p>
      ) : (
        <CategoriesAdmin
          categories={(cats.data ?? []) as CategoryRow[]}
          connectors={(connectors ?? []) as { id: string; supplier_name: string }[]}
          supplierWeights={(sup.data ?? []) as SupplierWeightRow[]}
          productCounts={counts}
        />
      )}
    </div>
  );
}
