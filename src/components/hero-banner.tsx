"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";

const DESKTOP_BANNERS = [
  "/brand/banner-horizontal-1.png",
  "/brand/banner-horizontal-2.png",
];

export function HeroBanner({ ctaLabel }: { ctaLabel: string }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((i) => (i + 1) % DESKTOP_BANNERS.length), 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="relative w-full overflow-hidden bg-black/5">
      {/* Desktop/tablet: rotating horizontal banners */}
      <div className="hidden sm:block relative w-full aspect-[16/7] md:aspect-[2.2/1] lg:aspect-[2.5/1] overflow-hidden">
        {DESKTOP_BANNERS.map((src, i) => (
          <Image
            key={src}
            src={src}
            alt="The Dressing Project — ready to ship, express worldwide wholesale"
            fill
            sizes="100vw"
            priority={i === 0}
            className={`object-cover object-center transition-all duration-1000 transform ease-out ${
              i === active ? "opacity-100 scale-100" : "opacity-0 scale-105"
            }`}
          />
        ))}
      </div>

      {/* Mobile: vertical banner adapting smoothly to screen width */}
      <div className="sm:hidden relative w-full aspect-[4/5] xs:aspect-[3/4] overflow-hidden">
        <Image
          src="/brand/banner-vertical-mobile.png"
          alt="The Dressing Project — ready to ship, express worldwide wholesale"
          fill
          sizes="100vw"
          priority
          className="object-cover object-center"
        />
      </div>

      {/* Editorial Luxury Badge */}
      <div className="absolute top-6 left-6 sm:left-8 z-10 hidden sm:block">
        <span className="text-[10px] uppercase tracking-[0.25em] text-white/90 bg-black/40 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20">
          Alta Costura · Edição Limitada
        </span>
      </div>

      {/* Banner navigation indicators for desktop */}
      <div className="hidden sm:flex absolute bottom-6 left-6 sm:left-8 gap-2 z-10 items-center">
        {DESKTOP_BANNERS.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`h-1.5 transition-all duration-300 rounded-full ${
              i === active ? "w-8 bg-white shadow-md" : "w-2 bg-white/50 hover:bg-white/90"
            }`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>

      {/* CTA Button with shimmer and shadow */}
      <div className="absolute bottom-6 right-6 sm:bottom-8 sm:right-8 z-10">
        <Link
          href="/cadastro"
          className="relative inline-flex items-center justify-center bg-accent text-white px-6 py-3 sm:px-8 sm:py-3.5 text-xs sm:text-sm uppercase tracking-[0.15em] font-semibold hover:bg-accent-hover transition-all duration-300 shadow-xl hover:shadow-2xl hover:-translate-y-0.5 rounded-sm overflow-hidden group"
        >
          <span className="relative z-10">{ctaLabel}</span>
          <span className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
        </Link>
      </div>
    </section>
  );
}
