"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { ProductCard } from "@/components/product-card";
import type { CatalogProduct } from "@/lib/catalog";
import type { SiteMode } from "@/lib/site-mode";

export function ProductCarousel({
  title,
  products,
  siteMode,
}: {
  title: string;
  products: CatalogProduct[];
  siteMode: SiteMode;
}) {
  const t = useTranslations("home");
  const tProduct = useTranslations("product");
  const tCommon = useTranslations("common");
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollBy(delta: number) {
    scrollerRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  }

  if (products.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-16 animate-fade-in-up">
      <div className="flex items-end justify-between mb-8 pb-4 border-b border-border/80">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-6 h-[1px] bg-gold" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-accent font-semibold">
              {t("carouselEyebrow")}
            </span>
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-normal tracking-wide text-foreground">
            {title}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-block text-xs text-muted tracking-wider mr-2 font-medium">
            {products.length} {products.length === 1 ? tProduct("dress") : tProduct("dresses")}
          </span>
          <button
            aria-label={tCommon("previous")}
            onClick={() => scrollBy(-320)}
            className="w-10 h-10 rounded-full border border-border/80 hover:border-gold hover:text-accent flex items-center justify-center text-sm font-semibold transition-all hover:scale-105 active:scale-95 bg-white shadow-xs"
          >
            ←
          </button>
          <button
            aria-label={tCommon("next")}
            onClick={() => scrollBy(320)}
            className="w-10 h-10 rounded-full border border-border/80 hover:border-gold hover:text-accent flex items-center justify-center text-sm font-semibold transition-all hover:scale-105 active:scale-95 bg-white shadow-xs"
          >
            →
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex gap-5 sm:gap-6 lg:gap-8 overflow-x-auto scrollbar-none scroll-smooth snap-x snap-mandatory py-4 px-1 -mx-1"
      >
        {products.map((product) => (
          <div
            key={product.id}
            className="w-[260px] sm:w-[285px] lg:w-[305px] shrink-0 snap-start"
          >
            <ProductCard product={product} siteMode={siteMode} />
          </div>
        ))}
      </div>
    </section>
  );
}
