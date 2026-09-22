"use client";

import { useState } from "react";
import { ProductCard } from "@/components/product-card";
import type { CatalogProduct } from "@/lib/catalog";
import type { SiteMode } from "@/lib/site-mode";

export function CategoryProductGrid({
  categoryName,
  products,
  siteMode,
}: {
  categoryName: string;
  products: CatalogProduct[];
  siteMode: SiteMode;
}) {
  const [columns, setColumns] = useState<2 | 3 | 4>(4);
  const [sortBy, setSortBy] = useState<"featured" | "price-asc" | "price-desc" | "title">("featured");

  const sortedProducts = [...products].sort((a, b) => {
    if (sortBy === "title") {
      return a.title.localeCompare(b.title);
    }
    if (sortBy === "price-asc" && a.pricing && b.pricing) {
      return (a.pricing.priceBrl ?? 0) - (b.pricing.priceBrl ?? 0);
    }
    if (sortBy === "price-desc" && a.pricing && b.pricing) {
      return (b.pricing.priceBrl ?? 0) - (a.pricing.priceBrl ?? 0);
    }
    return 0;
  });

  const gridColsClass =
    columns === 2
      ? "grid-cols-2"
      : columns === 3
      ? "grid-cols-2 sm:grid-cols-3"
      : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-16">
      {/* Category Luxury Header */}
      <div className="mb-10 text-center max-w-2xl mx-auto space-y-3 animate-fade-in-up">
        <div className="flex items-center justify-center gap-2">
          <span className="w-8 h-[1px] bg-gold" />
          <span className="text-[10px] uppercase tracking-[0.3em] font-semibold text-accent">
            Haute Couture Collection
          </span>
          <span className="w-8 h-[1px] bg-gold" />
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal tracking-wide capitalize text-foreground">
          {categoryName}
        </h1>

        <p className="text-xs sm:text-sm text-muted tracking-wider font-light max-w-md mx-auto">
          Confira nossa seleção exclusiva de vestidos de festa, alfaiataria e modelos de alta costura.
        </p>
      </div>

      {/* Grid Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8 pb-4 border-b border-border/80 text-xs text-muted">
        <span className="font-medium tracking-wider">
          Exibindo <strong className="text-foreground">{products.length}</strong> {products.length === 1 ? "peça" : "peças exclusivas"}
        </span>

        <div className="flex items-center gap-6">
          {/* Sort Selector */}
          <div className="flex items-center gap-2">
            <label htmlFor="sort-by" className="hidden sm:inline tracking-wider font-medium">Ordenar por:</label>
            <select
              id="sort-by"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="bg-white border border-border/80 rounded px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent shadow-2xs font-medium cursor-pointer"
            >
              <option value="featured">Destaques</option>
              <option value="price-asc">Menor Preço</option>
              <option value="price-desc">Maior Preço</option>
              <option value="title">Nome (A-Z)</option>
            </select>
          </div>

          {/* Grid Layout Switcher Buttons */}
          <div className="hidden sm:flex items-center gap-1 bg-surface p-1 rounded border border-border/60">
            <button
              onClick={() => setColumns(2)}
              title="2 colunas"
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${
                columns === 2 ? "bg-white text-accent shadow-xs" : "text-muted hover:text-foreground"
              }`}
            >
              2 Colunas
            </button>
            <button
              onClick={() => setColumns(3)}
              title="3 colunas"
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${
                columns === 3 ? "bg-white text-accent shadow-xs" : "text-muted hover:text-foreground"
              }`}
            >
              3 Colunas
            </button>
            <button
              onClick={() => setColumns(4)}
              title="4 colunas"
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${
                columns === 4 ? "bg-white text-accent shadow-xs" : "text-muted hover:text-foreground"
              }`}
            >
              4 Colunas
            </button>
          </div>
        </div>
      </div>

      {/* Dress Grid */}
      {sortedProducts.length === 0 ? (
        <div className="py-20 text-center space-y-4 bg-surface/50 rounded-sm border border-border/60">
          <div className="w-16 h-16 rounded-full bg-white mx-auto flex items-center justify-center shadow-xs text-accent text-2xl font-serif">
            ✨
          </div>
          <h3 className="font-serif text-xl text-foreground font-medium">Nenhum vestido encontrado nesta categoria</h3>
          <p className="text-xs text-muted max-w-sm mx-auto">
            Novos modelos são adicionados semanalmente ao nosso catálogo de alta costura.
          </p>
        </div>
      ) : (
        <div className={`grid ${gridColsClass} gap-4 sm:gap-6 lg:gap-8 animate-fade-in`}>
          {sortedProducts.map((product) => (
            <ProductCard key={product.id} product={product} siteMode={siteMode} />
          ))}
        </div>
      )}
    </div>
  );
}
