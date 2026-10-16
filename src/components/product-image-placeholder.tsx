"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { isOptimizable, optimizedSrcSet, optimizedUrl } from "@/lib/image-opt";
import { croppedImageStyle, type ImageCrop } from "@/lib/image-crop";

function hueFromSlug(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) % 360;
  }
  return hash;
}

/**
 * Product photograph in the 2:3 product standard. Never auto-crops: without
 * a TDP-defined crop the whole photo is shown (contained), so heads, hems
 * and trains are never cut. Smooth fallback when the image is missing.
 */
export function ProductImagePlaceholder({
  slug,
  label,
  imageUrl,
  secondaryImageUrl,
  crop = null,
  secondaryCrop = null,
  priority = false,
  sizes = "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw",
}: {
  slug: string;
  label: string;
  imageUrl?: string | null;
  secondaryImageUrl?: string | null;
  crop?: ImageCrop | null;
  secondaryCrop?: ImageCrop | null;
  /** Above-the-fold photo: loaded eagerly with high priority. */
  priority?: boolean;
  sizes?: string;
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

  const shown = isHovered && secondarySrc ? secondarySrc : imgSrc;

  if (!error) {
    return (
      <div
        className="relative aspect-[2/3] w-full overflow-hidden bg-surface group/img transition-all duration-500 rounded-t-sm"
        onMouseEnter={() => {
          setIsHovered(true);
          if (secondarySrc) new window.Image().src = isOptimizable(secondarySrc) ? optimizedUrl(secondarySrc, 828) : secondarySrc;
        }}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Shimmer loading skeleton */}
        {!loaded && (
          <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/40 to-surface animate-pulse" />
        )}

        {/* Main Dress Photograph — optimized, painted as soon as bytes arrive */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shown && isOptimizable(shown) ? optimizedUrl(shown, 828) : shown}
          srcSet={shown ? optimizedSrcSet(shown) : undefined}
          sizes={sizes}
          alt={label}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          referrerPolicy="no-referrer"
          ref={(el) => {
            if (el?.complete && el.naturalWidth > 0 && !loaded) setLoaded(true);
          }}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          style={croppedImageStyle(isHovered && secondarySrc ? secondaryCrop : crop)}
          className={`transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        />

        {/* Elegant top gradient vignette for contrast */}
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/20 via-transparent to-transparent pointer-events-none opacity-40 group-hover/img:opacity-20 transition-opacity" />
      </div>
    );
  }

  // High-fashion fallback layout when image loading fails or image is missing
  return (
    <div
      className="aspect-[2/3] w-full flex flex-col justify-between p-4 relative overflow-hidden group/fallback rounded-t-sm"
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
