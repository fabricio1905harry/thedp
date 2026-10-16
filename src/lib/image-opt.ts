/**
 * Image delivery. Photos from Supabase Storage, Google Drive and any host
 * listed in NEXT_PUBLIC_IMAGE_HOSTS (comma separated, e.g. the supplier's
 * CDN) go through Next's image optimizer: resized to the screen, served as
 * AVIF/WebP and cached at the edge. Other hosts are served as-is.
 */
export const IMAGE_WIDTHS = [320, 480, 640, 828, 1080, 1440, 1920] as const;

function extraHosts(): string[] {
  return (process.env.NEXT_PUBLIC_IMAGE_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function isOptimizable(src: string): boolean {
  if (src.startsWith("/")) return true;
  try {
    const host = new URL(src).hostname.toLowerCase();
    if (host.endsWith(".supabase.co") || host === "lh3.googleusercontent.com") return true;
    return extraHosts().some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export function optimizedUrl(src: string, width: number, quality = 75): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;
}

export function optimizedSrcSet(src: string, maxWidth = 1920): string | undefined {
  if (!isOptimizable(src)) return undefined;
  return IMAGE_WIDTHS.filter((w) => w <= maxWidth)
    .map((w) => `${optimizedUrl(src, w)} ${w}w`)
    .join(", ");
}
