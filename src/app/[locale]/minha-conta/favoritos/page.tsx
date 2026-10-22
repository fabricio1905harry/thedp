import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentCustomer, isApproved } from "@/lib/auth";
import { getFavoriteProductIds, productsByIds } from "@/lib/catalog-extra";
import { ProductCard } from "@/components/product-card";
import { SITE_MODE_HEADER, type SiteMode } from "@/lib/site-mode";

/** My Account → Favorites: products the signed-in buyer hearted. */
export default async function FavoritesPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login");
  const t = await getTranslations("c2.favorites");
  const siteMode = ((await headers()).get(SITE_MODE_HEADER) as SiteMode) ?? "internacional";

  const ids = await getFavoriteProductIds(customer.id);
  const products = await productsByIds(ids, isApproved(customer));

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 sm:py-16">
      <Link href="/minha-conta" className="text-[11px] uppercase tracking-[0.2em] text-muted hover:text-foreground">
        ← {t("backToAccount")}
      </Link>
      <h1 className="mt-3 font-serif text-4xl">{t("title")}</h1>
      {products.length === 0 ? (
        <p className="mt-8 text-sm text-muted border border-dashed border-border p-8 text-center">
          {t("empty")}{" "}
          <Link href="/shop" className="underline text-foreground">
            {t("browse")}
          </Link>
        </p>
      ) : (
        <div className="mt-8 grid stagger grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} siteMode={siteMode} />
          ))}
        </div>
      )}
    </div>
  );
}
