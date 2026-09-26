"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

function hueFromSlug(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) % 360;
  }
  return hash;
}

/** Displays product photograph for dresses with high-fashion object-top positioning and smooth fallback. */
export function ProductImagePlaceholder({
  slug,
  label,
  imageUrl,
  secondaryImageUrl,
}: {
  slug: string;
  label: string;
  imageUrl?: string | null;
  secondaryImageUrl?: string | null;
}) {
  const t = useTranslations("product");
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const hue = hueFromSlug(slug);

  let imgSrc = imageUrl?.trim() || `/images/products/${slug}.png`;
  if (
    imageUrl &&
    !imageUrl.startsWith("http://") &&
    !imageUrl.startsWith("https://") &&
    !imageUrl.startsWith("/")
  ) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    imgSrc = `${supabaseUrl}/storage/v1/object/public/${imageUrl}`;
  }

  let secondarySrc = secondaryImageUrl?.trim();
  if (
    secondarySrc &&
    !secondarySrc.startsWith("http://") &&
    !secondarySrc.startsWith("https://") &&
    !secondarySrc.startsWith("/")
  ) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    secondarySrc = `${supabaseUrl}/storage/v1/object/public/${secondarySrc}`;
  }

  if (!error) {
    return (
      <div
        className="relative aspect-[3/4] w-full overflow-hidden bg-surface group/img transition-all duration-500 rounded-t-sm"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Shimmer loading skeleton */}
        {!loaded && (
          <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/40 to-surface animate-pulse" />
        )}

        {/* Main Dress Photograph */}
        <img
          src={isHovered && secondarySrc ? secondarySrc : imgSrc}
          alt={label}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={`w-full h-full object-cover object-top transition-all duration-700 ease-out ${
            loaded ? "opacity-100 scale-100" : "opacity-0 scale-105"
          } group-hover/img:scale-108`}
        />

        {/* Elegant top gradient vignette for contrast */}
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/20 via-transparent to-transparent pointer-events-none opacity-40 group-hover/img:opacity-20 transition-opacity" />
      </div>
    );
  }

  // High-fashion fallback layout when image loading fails or image is missing
  return (
    <div
      className="aspect-[3/4] w-full flex flex-col justify-between p-4 relative overflow-hidden group/fallback rounded-t-sm"
      style={{
        background: `radial-gradient(circle at 50% 30%, hsl(${hue} 30% 94%), hsl(${hue} 40% 82%))`,
      }}
      role="img"
      aria-label={label}
    >
      <div className="flex items-center justify-between w-full">
        <span className="text-[9px] uppercase tracking-[0.25em] font-semibold text-accent/80 bg-white/70 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/40 shadow-xs">
          The Dress
        </span>
        <span className="w-1.5 h-1.5 rounded-full bg-gold animate-ping" />
      </div>

      <div className="my-auto text-center space-y-1">
        <div className="w-12 h-12 rounded-full border border-accent/20 bg-white/40 backdrop-blur-md mx-auto flex items-center justify-center shadow-inner group-hover/fallback:scale-110 transition-transform duration-500">
          <span className="font-serif text-lg font-bold text-accent">
            {label.charAt(0).toUpperCase()}
          </span>
        </div>
        <p className="font-serif text-xs font-medium text-foreground/80 line-clamp-1 italic px-2">
          {label}
        </p>
      </div>

      <div className="text-center pt-2 border-t border-accent/10">
        <span className="text-[10px] uppercase tracking-[0.2em] font-medium text-muted">
          {t("placeholderTagline")}
        </span>
      </div>
    </div>
  );
}
