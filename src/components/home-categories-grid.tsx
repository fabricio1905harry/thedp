"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

interface CategoryCardItem {
  key: "festa" | "longos" | "midi" | "atacado";
  categorySlug: string;
  bgGradient: string;
  imageFallback: string;
}

const FEATURED_CATEGORIES: CategoryCardItem[] = [
  {
    key: "festa",
    categorySlug: "vestidos",
    bgGradient: "from-zinc-800/40 via-black/50 to-black/80",
    imageFallback: "/images/products/vestido-um-ombro.png",
  },
  {
    key: "longos",
    categorySlug: "vestidos",
    bgGradient: "from-neutral-900/50 via-black/50 to-black/80",
    imageFallback: "/images/products/vestido-longo-seresta.png",
  },
  {
    key: "midi",
    categorySlug: "vestidos",
    bgGradient: "from-stone-800/40 via-black/50 to-black/80",
    imageFallback: "/images/products/vestido-midalia-seda.png",
  },
  {
    key: "atacado",
    categorySlug: "atacado",
    bgGradient: "from-zinc-900/60 via-black/60 to-black/90",
    imageFallback: "/images/products/vestido-evase-elegante.png",
  },
];

export function HomeCategoriesGrid() {
  const t = useTranslations("home");

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-16">
      <div className="text-center max-w-xl mx-auto mb-10 space-y-2">
        <div className="flex items-center justify-center gap-2">
          <span className="w-8 h-[1px] bg-gold" />
          <span className="text-[10px] uppercase tracking-[0.3em] font-semibold text-accent">
            {t("categoriesEyebrow")}
          </span>
          <span className="w-8 h-[1px] bg-gold" />
        </div>
        <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-normal tracking-wide text-foreground">
          {t("categoriesTitle")}
        </h2>
        <p className="text-xs sm:text-sm text-muted font-light tracking-wide">
          {t("categoriesSubtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {FEATURED_CATEGORIES.map((cat) => {
          const title = t(`categories.${cat.key}.title`);
          return (
            <Link
              key={cat.key}
              href={cat.categorySlug === "atacado" ? "/atacado" : `/categorias/${cat.categorySlug}`}
              className="group relative h-80 rounded-sm overflow-hidden border border-border/60 hover:border-gold/60 shadow-sm hover:shadow-xl transition-all duration-500 flex flex-col justify-end p-6 hover-lift"
            >
              {/* Background Image / Fallback */}
              <div className="absolute inset-0 bg-surface">
                <img
                  src={cat.imageFallback}
                  alt={title}
                  className="w-full h-full object-cover object-top group-hover:scale-108 transition-transform duration-700 ease-out"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              </div>

              {/* Gradient Dark Overlay */}
              <div className={`absolute inset-0 bg-gradient-to-t ${cat.bgGradient} group-hover:opacity-90 transition-opacity duration-500`} />

              {/* Top Category Tag */}
              <div className="absolute top-4 left-4 z-10">
                <span className="text-[9px] uppercase tracking-[0.2em] font-semibold text-white bg-accent/90 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/20 shadow-xs">
                  {t(`categories.${cat.key}.tag`)}
                </span>
              </div>

              {/* Content */}
              <div className="relative z-10 space-y-1.5 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-400">
                <h3 className="font-serif text-xl sm:text-2xl font-normal text-white tracking-wide">
                  {title}
                </h3>
                <p className="text-xs text-white/80 font-light line-clamp-2 leading-relaxed">
                  {t(`categories.${cat.key}.subtitle`)}
                </p>
                <div className="pt-2 flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] font-semibold text-gold group-hover:text-white transition-colors">
                  <span>{t("exploreCollection")}</span>
                  <span className="transform group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
