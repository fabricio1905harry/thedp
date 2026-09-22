import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { getHomeCatalogSections, getPublicProductsList, SECTION_TITLES } from "@/lib/catalog";
import { ProductCarousel } from "@/components/product-carousel";
import { HeroBanner } from "@/components/hero-banner";
import { BenefitsBanner } from "@/components/benefits-banner";
import { HomeCategoriesGrid } from "@/components/home-categories-grid";
import { HomeFullCatalogGrid } from "@/components/home-full-catalog-grid";
import { HomeWholesaleBanner } from "@/components/home-wholesale-banner";
import { getCurrentCustomer, isApproved } from "@/lib/auth";
import { SITE_MODE_HEADER, type SiteMode } from "@/lib/site-mode";

export default async function HomePage() {
  const t = await getTranslations();
  const headerList = await headers();
  const siteMode = (headerList.get(SITE_MODE_HEADER) as SiteMode) ?? "internacional";
  const customer = await getCurrentCustomer();
  const approved = isApproved(customer);

  const [sections, allProducts] = await Promise.all([
    getHomeCatalogSections(approved),
    getPublicProductsList(approved, 24),
  ]);

  return (
    <div className="space-y-4">
      {/* 1. Main Luxury Hero Banner */}
      <HeroBanner ctaLabel={t("home.heroCta")} />

      {/* 2. Global Shipping & Benefits Bar */}
      <BenefitsBanner />

      {/* 3. Visual Categories Showcase Grid */}
      <HomeCategoriesGrid />

      {/* 4. First Carousel: Lançamentos & Novidades */}
      {sections.length > 0 && sections[0] && (
        <ProductCarousel
          title={SECTION_TITLES[sections[0].key] ?? "Lançamentos de Alta Costura"}
          products={sections[0].products}
          siteMode={siteMode}
        />
      )}

      {/* 5. Rich Full Dress Catalog Grid with Filter Tabs */}
      <HomeFullCatalogGrid products={allProducts} siteMode={siteMode} />

      {/* 6. Wholesale & B2B Store Banner */}
      <HomeWholesaleBanner />

      {/* 7. Second Carousel: Destaques & Mais Desejados */}
      {sections.length > 1 && sections[1] && sections[1].products.length > 0 && (
        <ProductCarousel
          title={SECTION_TITLES[sections[1].key] ?? "Modelos Destaques Exclusivos"}
          products={sections[1].products}
          siteMode={siteMode}
        />
      )}
    </div>
  );
}
