"use client";

import { useState } from "react";

/**
 * Plain <img> for CMS/Drive images with a local fallback: if the remote file
 * is private, deleted or rate-limited, the page still shows a picture.
 */
export function RemoteImage({
  src,
  fallbackSrc,
  alt,
  className,
  priority,
}: {
  src: string;
  fallbackSrc?: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={failed && fallbackSrc ? fallbackSrc : src}
      alt={alt}
      referrerPolicy="no-referrer"
      fetchPriority={priority ? "high" : undefined}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
