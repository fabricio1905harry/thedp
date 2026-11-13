import { normalizeImageUrl } from "@/lib/image-url";
import { isOptimizable, optimizedSrcSet, optimizedUrl } from "@/lib/image-opt";

const s = (v: unknown) => (typeof v === "string" ? v : "");

/** Desktop + mobile banner of the visitor's language; a language without its own uses the default banner. */
export function localizedBanners(c: Record<string, unknown>, locale: string) {
  const lang = ["en", "es", "pt"].includes(locale) ? locale : "en";
  const pick = (kind: "desktop" | "mobile") => normalizeImageUrl(s(c[`${kind}_image_${lang}`])) ?? normalizeImageUrl(s(c[`${kind}_image`]));
  const desktop = pick("desktop");
  return { desktop, mobile: pick("mobile") ?? desktop };
}

/**
 * The whole art is shown (no crop, no distortion): desktop and mobile each keep their own aspect ratio. On
 * large screens the height is capped to the visible area under the header so the banner never needs a scroll.
 */
export function BannerPicture({
  desktop,
  mobile,
  alt,
  priority,
  fill = "screen",
}: {
  desktop: string | null;
  mobile: string | null;
  alt: string;
  priority: boolean;
  /** "screen": Hero, height capped to the visible area; "width": takes the full width of its container */
  fill?: "screen" | "width";
}) {
  return (
    <picture className="block">
      {mobile && <source media="(max-width: 639px)" srcSet={optimizedSrcSet(mobile, 828) ?? mobile} sizes="100vw" />}
      <img
        src={desktop && isOptimizable(desktop) ? optimizedUrl(desktop, 1920) : desktop ?? mobile ?? ""}
        srcSet={desktop ? optimizedSrcSet(desktop) : undefined}
        sizes="100vw"
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        alt={alt}
        referrerPolicy="no-referrer"
        fetchPriority={priority ? "high" : "auto"}
        className={
          fill === "width"
            ? "block h-auto w-full"
            : // header: two rows below 2xl (~11rem with the bar), one row from 2xl (~7.5rem)
              "mx-auto block h-auto w-auto max-w-full sm:max-h-[calc(100svh-11rem)] 2xl:max-h-[calc(100svh-7.5rem)]"
        }
      />
    </picture>
  );
}
