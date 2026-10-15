import type { CSSProperties } from "react";

/**
 * Product image framing. Product/card images are 2:3 (reference
 * 1200×1800). There is NO automatic crop: without a TDP-defined crop the
 * full photo is shown letterboxed inside the 2:3 frame (object-contain),
 * so heads, hems or trains are never cut. A crop is a rectangle in
 * normalised image coordinates (0..1) chosen in the Admin crop editor.
 */
export const PRODUCT_ASPECT = 2 / 3;

export interface ImageCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function parseCrop(value: unknown): ImageCrop | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  const crop = { x: Number(c.x), y: Number(c.y), width: Number(c.width), height: Number(c.height) };
  if (Object.values(crop).some((n) => !Number.isFinite(n))) return null;
  if (crop.width <= 0 || crop.height <= 0 || crop.width > 1 || crop.height > 1) return null;
  return crop;
}

/**
 * Largest 2:3 crop for an image of the given pixel size, scaled by zoom
 * (≥1) and positioned by panX/panY (0..1 across the free space).
 */
export function cropFromControls(
  naturalWidth: number,
  naturalHeight: number,
  zoom: number,
  panX: number,
  panY: number
): ImageCrop {
  const imageAspect = naturalWidth / naturalHeight;
  let width = 1;
  let height = 1;
  if (imageAspect > PRODUCT_ASPECT) {
    width = PRODUCT_ASPECT / imageAspect;
  } else {
    height = imageAspect / PRODUCT_ASPECT;
  }
  const z = Math.max(1, zoom);
  width /= z;
  height /= z;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return {
    x: (1 - width) * clamp(panX),
    y: (1 - height) * clamp(panY),
    width,
    height,
  };
}

/**
 * Style for an <img> inside a `relative overflow-hidden aspect-[2/3]`
 * container. With a crop the image is scaled/offset so the crop fills the
 * frame; without one it is contained (never cut).
 */
export function croppedImageStyle(crop: ImageCrop | null): CSSProperties {
  if (!crop) {
    return { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" };
  }
  return {
    position: "absolute",
    width: `${100 / crop.width}%`,
    height: `${100 / crop.height}%`,
    left: `${(-crop.x / crop.width) * 100}%`,
    top: `${(-crop.y / crop.height) * 100}%`,
    maxWidth: "none",
    objectFit: "fill",
  };
}
