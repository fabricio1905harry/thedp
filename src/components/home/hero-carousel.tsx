"use client";

import { useEffect, useRef, useState } from "react";
import { CmsLink } from "@/components/cms-link";
import { BannerPicture } from "@/components/home/banner-picture";

export interface HeroSlide {
  desktop: string | null;
  mobile: string | null;
  alt: string;
  link: string;
}

/**
 * Rotating Hero (P47). All slides share one grid cell, so the Hero keeps the height of the tallest art and
 * nothing jumps when it rotates. Auto-advances every `intervalMs` (paused on hover / focus, and off when the
 * visitor prefers reduced motion); dots, arrows and swipe change it by hand.
 */
export function HeroCarousel({
  slides,
  intervalMs,
  overlay,
  lazy = false,
}: {
  slides: HeroSlide[];
  intervalMs: number;
  overlay?: React.ReactNode;
  /** below the fold (second banner): no image is loaded with high priority */
  lazy?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = slides.length;
  const go = (i: number) => setIndex(((i % count) + count) % count);

  useEffect(() => {
    if (paused || count < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => window.clearTimeout(id);
  }, [index, paused, count, intervalMs]);

  return (
    <section
      className="relative w-full bg-surface overflow-hidden"
      aria-roledescription="carousel"
      aria-label="Banners"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        const end = e.changedTouches[0]?.clientX;
        if (start == null || end == null || Math.abs(end - start) < 40) return;
        go(index + (end < start ? 1 : -1));
      }}
    >
      <div className="grid">
        {slides.map((slide, i) => {
          const art = <BannerPicture desktop={slide.desktop} mobile={slide.mobile} alt={slide.alt} priority={!lazy && i === 0} />;
          return (
            <div
              key={i}
              className={`[grid-area:1/1] transition-opacity duration-700 ease-out ${i === index ? "opacity-100" : "opacity-0 pointer-events-none"}`}
              aria-hidden={i !== index}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${count}`}
            >
              {slide.link ? (
                <CmsLink href={slide.link} className="block w-full cursor-pointer">
                  {art}
                </CmsLink>
              ) : (
                art
              )}
            </div>
          );
        })}
      </div>
      {overlay}
      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Anterior"
            onClick={() => go(index - 1)}
            className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full bg-white/80 text-lg shadow hover:bg-white"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Próximo"
            onClick={() => go(index + 1)}
            className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full bg-white/80 text-lg shadow hover:bg-white"
          >
            ›
          </button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Banner ${i + 1}`}
                aria-current={i === index}
                onClick={() => go(i)}
                className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-white" : "w-2 bg-white/60 hover:bg-white/90"} shadow`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
