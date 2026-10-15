"use client";

import { useState } from "react";
import { videoSource } from "@/lib/video";

/** Poster first, player on click (keeps the page light). */
export function VideoPlayer({
  url,
  posterDesktop,
  posterMobile,
  title,
}: {
  url: string;
  posterDesktop?: string | null;
  posterMobile?: string | null;
  title?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const source = videoSource(url, true);
  if (!source) return null;

  return (
    <div className="relative w-full aspect-[9/16] sm:aspect-video bg-black overflow-hidden">
      {playing ? (
        source.kind === "iframe" ? (
          <iframe src={source.src} title={title || "Video"} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="absolute inset-0 w-full h-full" />
        ) : (
          <video src={source.src} controls autoPlay playsInline className="absolute inset-0 w-full h-full object-contain" />
        )
      ) : (
        <button type="button" onClick={() => setPlaying(true)} className="absolute inset-0 w-full h-full group" aria-label={title || "Play video"}>
          {(posterDesktop || posterMobile) && (
            <picture>
              {posterMobile && <source media="(max-width: 639px)" srcSet={posterMobile} />}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={posterDesktop || posterMobile || ""} alt="" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover" />
            </picture>
          )}
          <span className="absolute inset-0 bg-black/25 group-hover:bg-black/35 transition-colors" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-16 h-16 rounded-full border border-white/80 text-white flex items-center justify-center text-xl pl-1">▶</span>
          </span>
        </button>
      )}
    </div>
  );
}
