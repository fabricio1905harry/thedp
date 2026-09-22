import { headers } from "next/headers";
import { getCategoryProducts } from "@/lib/catalog";
import { CategoryProductGrid } from "@/components/category-product-grid";
import { getCurrentCustomer, isApproved } from "@/lib/auth";
import { SITE_MODE_HEADER, type SiteMode } from "@/lib/site-mode";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ categoria: string; locale: string }>;
}) {
  const { categoria } = await params;
  const decodedCategory = decodeURIComponent(categoria);
  const headerList = await headers();
  const siteMode = (headerList.get(SITE_MODE_HEADER) as SiteMode) ?? "internacional";
  const customer = await getCurrentCustomer();
  const approved = isApproved(customer);

  const products = await getCategoryProducts(decodedCategory, approved);

  return (
    <CategoryProductGrid
      categoryName={decodedCategory}
      products={products}
      siteMode={siteMode}
    />
  );
}
