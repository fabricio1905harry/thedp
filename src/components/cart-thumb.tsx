"use client";

import { croppedImageStyle, type ImageCrop } from "@/lib/image-crop";
import { isOptimizable, optimizedUrl } from "@/lib/image-opt";

/** Small product photo for the cart / order summary (same 2:3 framing and crop as the product page). */
export function CartThumb({ src, crop, title, className = "w-14" }: { src?: string | null; crop?: ImageCrop | null; title: string; className?: string }) {
  const full = src
    ? src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/")
      ? src
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${src}`
    : null;
  return (
    <div className={`relative aspect-[2/3] shrink-0 overflow-hidden rounded-sm border border-border bg-surface ${className}`}>
      {full ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={isOptimizable(full) ? optimizedUrl(full, 160) : full}
          alt={title}
          loading="lazy"
          decoding="async"
          style={croppedImageStyle(crop ?? null)}
        />
      ) : (
        <span aria-hidden className="absolute inset-0 flex items-center justify-center font-serif text-lg text-muted">
          {title.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}
