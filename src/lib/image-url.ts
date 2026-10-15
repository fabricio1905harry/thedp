/**
 * Google Drive share links → direct image URLs, so the TDP can paste a Drive
 * link anywhere an image is asked. The file must be shared as "anyone with
 * the link". Handles /file/d/<id>/view, open?id=<id> and uc?id=<id>.
 */
export function driveFileId(url: string): string | null {
  const match =
    url.match(/drive\.google\.com\/file\/d\/([\w-]+)/) ??
    url.match(/drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([\w-]+)/) ??
    url.match(/lh3\.googleusercontent\.com\/d\/([\w-]+)/);
  return match ? match[1] : null;
}

export function normalizeImageUrl(url: string | null | undefined, width = 2400): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const driveId = driveFileId(trimmed);
  if (driveId) return `https://lh3.googleusercontent.com/d/${driveId}=w${width}`;
  return trimmed;
}

/** Resolves a product_images.storage_path (full URL, Drive link or Supabase Storage path) into a displayable URL. */
export function resolveImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("/")) {
    return normalizeImageUrl(path);
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${supabaseUrl}/storage/v1/object/public/${path}`;
}
