"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ProductImagePlaceholder } from "@/components/product-image-placeholder";

export function ProductGallery({
  images,
  slug,
  title,
}: {
  images: string[];
  slug: string;
  title: string;
}) {
  const t = useTranslations("common");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const displayImages = images.length > 0 ? images : [`/images/products/${slug}.png`];
  const activeImage = displayImages[selectedIndex] || displayImages[0];
  const secondaryImage = displayImages[1] || null;

  function handlePrev() {
    setSelectedIndex((prev) => (prev === 0 ? displayImages.length - 1 : prev - 1));
  }

  function handleNext() {
    setSelectedIndex((prev) => (prev === displayImages.length - 1 ? 0 : prev + 1));
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Main Dress Image Slider Container */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-surface group border border-border/70 rounded-sm shadow-md">
        <div key={activeImage} className="w-full h-full animate-fade-in">
          <ProductImagePlaceholder
            slug={slug}
            label={title}
            imageUrl={activeImage}
            secondaryImageUrl={secondaryImage}
          />
        </div>

        {/* Prev / Next Slide Navigation Buttons */}
        {displayImages.length > 1 && (
          <>
            <button
              onClick={handlePrev}
              aria-label={t("previous")}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/90 hover:bg-white text-foreground flex items-center justify-center shadow-lg backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-300 border border-border hover:scale-105 active:scale-95 text-lg font-bold"
            >
              ‹
            </button>
            <button
              onClick={handleNext}
              aria-label={t("next")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/90 hover:bg-white text-foreground flex items-center justify-center shadow-lg backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-300 border border-border hover:scale-105 active:scale-95 text-lg font-bold"
            >
              ›
            </button>

            {/* Counter Badge */}
            <div className="absolute bottom-4 right-4 bg-black/75 text-white text-[11px] font-semibold tracking-widest px-3.5 py-1.5 rounded-full backdrop-blur-md border border-white/10 shadow-lg">
              {selectedIndex + 1} / {displayImages.length}
            </div>
          </>
        )}
      </div>

      {/* Thumbnails Preview Grid */}
      {displayImages.length > 1 && (
        <div className="flex gap-3 overflow-x-auto pb-2 pt-1 scrollbar-none">
          {displayImages.map((imgUrl, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <button
                key={`${imgUrl}-${idx}`}
                onClick={() => setSelectedIndex(idx)}
                aria-label={t("viewPhoto", { n: idx + 1 })}
                className={`relative aspect-[3/4] w-20 sm:w-24 shrink-0 overflow-hidden rounded-sm border transition-all duration-300 ${
                  isSelected
                    ? "border-accent ring-2 ring-accent/40 scale-105 shadow-md opacity-100"
                    : "border-border/80 opacity-70 hover:opacity-100 hover:border-gold"
                }`}
              >
                <img
                  src={
                    imgUrl.startsWith("http://") ||
                    imgUrl.startsWith("https://") ||
                    imgUrl.startsWith("/")
                      ? imgUrl
                      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${imgUrl}`
                  }
                  alt={`${title} - ${t("photo", { n: idx + 1 })}`}
                  className="w-full h-full object-cover object-top"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
