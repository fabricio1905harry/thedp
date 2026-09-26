"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ProductCard } from "@/components/product-card";
import type { CatalogProduct } from "@/lib/catalog";
import type { SiteMode } from "@/lib/site-mode";

export function HomeFullCatalogGrid({
  products,
  siteMode,
}: {
  products: CatalogProduct[];
  siteMode: SiteMode;
}) {
  const t = useTranslations("home");
  const [activeTab, setActiveTab] = useState<"all" | "featured" | "recent">("all");

  const filteredProducts =
    activeTab === "featured"
      ? products.filter((p) => p.isFeatured)
      : activeTab === "recent"
      ? products.slice(0, 8)
      : products;

  const displayProducts = filteredProducts.slice(0, 12);

  if (products.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-16 border-t border-border/60">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 pb-4 border-b border-border/80">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-6 h-[1px] bg-gold" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-accent font-semibold">
              {t("fullCatalogEyebrow")}
            </span>
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-normal tracking-wide text-foreground">
            {t("fullCatalogTitle")}
          </h2>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 bg-surface p-1 rounded-sm border border-border/60 self-start md:self-auto">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2 text-xs uppercase tracking-wider font-semibold rounded-xs transition-all ${
              activeTab === "all"
                ? "bg-accent text-white shadow-xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t("tabAll")} ({products.length})
          </button>
          <button
            onClick={() => setActiveTab("featured")}
            className={`px-4 py-2 text-xs uppercase tracking-wider font-semibold rounded-xs transition-all ${
              activeTab === "featured"
                ? "bg-accent text-white shadow-xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t("tabFeatured")}
          </button>
          <button
            onClick={() => setActiveTab("recent")}
            className={`px-4 py-2 text-xs uppercase tracking-wider font-semibold rounded-xs transition-all ${
              activeTab === "recent"
                ? "bg-accent text-white shadow-xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t("tabRecent")}
          </button>
        </div>
      </div>

      {/* Dress Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
        {displayProducts.map((product) => (
          <ProductCard key={product.id} product={product} siteMode={siteMode} />
        ))}
      </div>

      {/* Bottom CTA to view entire catalog */}
      <div className="mt-12 text-center">
        <Link
          href="/categorias/vestidos"
          className="inline-flex items-center gap-2 bg-foreground text-white px-8 py-3.5 text-xs uppercase tracking-[0.2em] font-semibold hover:bg-accent transition-all duration-300 shadow-md hover:shadow-xl rounded-xs"
        >
          <span>{t("viewFullCatalogCta")}</span>
          <span>→</span>
        </Link>
      </div>
    </section>
  );
}
