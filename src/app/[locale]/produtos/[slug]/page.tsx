import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { Link } from "@/i18n/navigation";
import { getProductDetail } from "@/lib/catalog";
import { ProductGallery } from "@/components/product-gallery";
import { getCurrentCustomer, isApproved } from "@/lib/auth";
import { SITE_MODE_HEADER, type SiteMode } from "@/lib/site-mode";
import { ProductPurchasePanel } from "@/components/product-purchase-panel";

import { BenefitsBanner } from "@/components/benefits-banner";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug } = await params;
  const t = await getTranslations("product");
  const headerList = await headers();
  const siteMode = (headerList.get(SITE_MODE_HEADER) as SiteMode) ?? "internacional";
  const customer = await getCurrentCustomer();
  const approved = isApproved(customer);

  const product = await getProductDetail(slug, approved);
  if (!product) notFound();

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 grid md:grid-cols-2 gap-10">
      <ProductGallery images={product.images} slug={product.slug} title={product.title} />

      <div>
        <p className="text-xs uppercase tracking-wide text-muted">{product.category}</p>
        <h1 className="font-serif text-3xl mt-1">{product.title}</h1>
        {product.description && (
          <p className="mt-4 text-sm text-muted leading-relaxed">{product.description}</p>
        )}

        <div className="mt-8">
          {siteMode === "nacional" ? (
            <p className="text-sm text-muted">
              {t("internationalOnly")}
            </p>
          ) : approved ? (
            <ProductPurchasePanel product={product} />
          ) : (
            <p className="text-sm font-medium text-accent">{t("signUpToSeePrice")}</p>
          )}
        </div>

        {siteMode === "internacional" && !approved && (
          <Link
            href="/cadastro"
            className="inline-block mt-4 text-sm text-accent underline underline-offset-2"
          >
            {t("signUpToSeePrice")}
          </Link>
        )}

        <BenefitsBanner compact />
      </div>
    </div>
  );
}
