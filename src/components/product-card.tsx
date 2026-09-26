"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ProductImagePlaceholder } from "@/components/product-image-placeholder";
import { useCurrency } from "@/components/currency-provider";
import { formatPicked } from "@/lib/currency";
import type { CatalogProduct } from "@/lib/catalog";
import type { SiteMode } from "@/lib/site-mode";

/**
 * High-fashion Dress Product Card.
 * Renders luxury dress layout with object-top photography, hover glassmorphism CTA,
 * category badges, and currency pricing formatting.
 */
export function ProductCard({
  product,
  siteMode,
}: {
  product: CatalogProduct;
  siteMode: SiteMode;
}) {
  const t = useTranslations("product");
  const { currency } = useCurrency();
  const priceLabel = product.pricing ? formatPicked(product.pricing, currency) : null;

  return (
    <Link
      href={`/produtos/${product.slug}`}
      className="group block relative rounded-sm bg-white/90 border border-border/70 hover:border-accent/40 shadow-xs hover:shadow-xl transition-all duration-500 overflow-hidden flex flex-col h-full hover-lift"
    >
      {/* Top Floating Badge */}
      <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5 bg-background/90 backdrop-blur-md px-2.5 py-1 rounded-full border border-border/80 shadow-xs">
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        <span className="text-[9px] uppercase tracking-[0.18em] font-semibold text-foreground/90">
          {product.category || "Vestidos"}
        </span>
      </div>

      {/* Dress Photograph Container */}
      <div className="relative overflow-hidden w-full bg-surface">
        <ProductImagePlaceholder
          slug={product.slug}
          label={product.title}
          imageUrl={product.imageUrl}
        />

        {/* Hover Glassmorphism Quick Action CTA */}
        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pointer-events-none">
          <span className="text-[11px] uppercase tracking-[0.2em] font-semibold text-white bg-accent/95 backdrop-blur-md w-full py-2.5 text-center rounded-xs shadow-lg transform translate-y-3 group-hover:translate-y-0 transition-transform duration-400 border border-white/10">
            {t("buy")}
          </span>
        </div>
      </div>

      {/* Dress Information & Pricing */}
      <div className="p-3.5 flex flex-col justify-between flex-1 bg-white space-y-2">
        <div>
          <h3 className="font-serif text-base sm:text-lg font-medium text-foreground group-hover:text-accent transition-colors duration-300 line-clamp-1 tracking-wide">
            {product.title}
          </h3>
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted font-normal pt-0.5">
            {t("cardTagline")}
          </p>
        </div>

        <div className="pt-2 border-t border-border/50 flex items-baseline justify-between">
          {siteMode === "nacional" ? (
            <span className="text-[11px] font-medium text-accent hover-underline-link">
              {t("consultWholesale")}
            </span>
          ) : priceLabel ? (
            <div>
              <p className="text-sm font-semibold text-foreground tracking-tight">
                {priceLabel}
              </p>
              <p className="text-[10px] text-muted tracking-wider">{t("installmentsLabel")}</p>
            </div>
          ) : (
            <span className="text-xs font-medium text-accent hover-underline-link inline-block">
              {t("signUpToSeePrice")}
            </span>
          )}

          <span className="text-xs font-serif text-accent/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 font-semibold">
            →
          </span>
        </div>
      </div>
    </Link>
  );
}
