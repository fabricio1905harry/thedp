import { CmsLink } from "@/components/cms-link";
import { ProductCard } from "@/components/product-card";
import { VideoPlayer } from "@/components/video-player";
import { normalizeImageUrl } from "@/lib/image-url";
import type { ShopProduct } from "@/lib/catalog";
import type { SiteMode } from "@/lib/site-mode";
import { isOptimizable, optimizedSrcSet, optimizedUrl } from "@/lib/image-opt";

type C = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown) => (Array.isArray(v) ? (v as C[]) : []);

const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.3em] text-muted";
const BUTTON =
  "inline-block bg-foreground text-background px-8 py-3.5 text-[11px] uppercase tracking-[0.2em] font-semibold hover:bg-accent-hover transition-colors";

export function HeroModule({ c }: { c: C }) {
  const desktop = normalizeImageUrl(s(c.desktop_image));
  const mobile = normalizeImageUrl(s(c.mobile_image)) ?? desktop;
  const headline = s(c.headline);
  const text = s(c.text);
  const cta = s(c.cta_text);
  const link = s(c.cta_link);
  if (!desktop && !mobile) return null;

  return (
    <section className="relative w-full overflow-hidden bg-surface">
      <picture>
        {mobile && <source media="(max-width: 639px)" srcSet={optimizedSrcSet(mobile, 828) ?? mobile} sizes="100vw" />}
        { }
        <img
          src={desktop && isOptimizable(desktop) ? optimizedUrl(desktop, 1920) : desktop ?? mobile ?? ""}
          srcSet={desktop ? optimizedSrcSet(desktop) : undefined}
          sizes="100vw"
          decoding="async"
          alt={s(c.alt)}
          referrerPolicy="no-referrer"
          fetchPriority="high"
          className="w-full h-auto sm:h-[56vw] sm:max-h-[720px] object-cover object-center aspect-[4/5] sm:aspect-auto"
        />
      </picture>
      {(headline || text) && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/25 to-transparent p-6 sm:p-12 text-white">
          <div className="max-w-7xl mx-auto">
            {headline && <h1 className="font-serif text-3xl sm:text-5xl leading-tight max-w-3xl">{headline}</h1>}
            {text && <p className="mt-3 text-sm sm:text-base text-white/90 max-w-xl">{text}</p>}
            {cta && link && (
              <CmsLink href={link} className="mt-6 inline-block bg-white text-black px-8 py-3.5 text-[11px] uppercase tracking-[0.2em] font-semibold hover:bg-white/90 transition-colors">
                {cta}
              </CmsLink>
            )}
          </div>
        </div>
      )}
      {!headline && cta && link && (
        <div className="absolute bottom-5 right-5 sm:bottom-10 sm:right-10">
          <CmsLink href={link} className={BUTTON}>
            {cta}
          </CmsLink>
        </div>
      )}
    </section>
  );
}

export function InstitutionalBannerModule({ c }: { c: C }) {
  return (
    <section className="max-w-4xl mx-auto px-4 py-16 sm:py-24 text-center">
      <h2 className="font-serif text-4xl sm:text-6xl tracking-[0.12em]">{s(c.headline)}</h2>
      <p className="mt-5 text-[11px] sm:text-xs uppercase tracking-[0.35em] text-muted">{s(c.subheadline)}</p>
    </section>
  );
}

export function ReadyToShipModule({ c }: { c: C }) {
  const items = list(c.items);
  if (items.length === 0) return null;
  return (
    <section className="border-y border-border">
      <ul className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border">
        {items.map((item, i) => (
          <li key={i} className="px-4 py-6 text-center text-[11px] sm:text-xs font-semibold uppercase tracking-[0.22em]">
            {s(item.text)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HowItWorksModule({ c }: { c: C }) {
  const steps = list(c.steps);
  return (
    <section id="how-it-works" className="max-w-6xl mx-auto px-4 py-16 sm:py-24">
      <div className="text-center max-w-3xl mx-auto">
        <p className={EYEBROW}>{s(c.title)}</p>
        <p className="mt-5 text-sm sm:text-base text-muted leading-relaxed">{s(c.intro)}</p>
      </div>

      <ol className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-y-10">
        {steps.map((step, i) => (
          <li key={i} className="relative px-6 lg:border-l border-border first:border-l-0">
            <span className="font-serif text-5xl text-border block leading-none">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-[0.25em]">{s(step.title)}</h3>
            <p className="mt-3 text-sm text-muted leading-relaxed">{s(step.text)}</p>
          </li>
        ))}
      </ol>

      <div className="mt-12 text-center space-y-3 max-w-2xl mx-auto">
        {s(c.payment_note) && <p className="text-xs text-muted uppercase tracking-[0.15em]">{s(c.payment_note)}</p>}
        {s(c.reserve_note) && (
          <p className="text-xs text-muted leading-relaxed">
            {s(c.reserve_note)}{" "}
            {s(c.reserve_cta) && (
              <CmsLink href="/reserve-for-later-delivery" className="underline underline-offset-2 text-foreground">
                {s(c.reserve_cta)}
              </CmsLink>
            )}
          </p>
        )}
      </div>
    </section>
  );
}

export function StartSmallModule({ c }: { c: C }) {
  return (
    <section className="bg-foreground text-background">
      <div className="max-w-4xl mx-auto px-4 py-16 sm:py-20 text-center">
        <h2 className="font-serif text-3xl sm:text-5xl leading-tight tracking-wide">{s(c.headline)}</h2>
        <p className="mt-5 text-sm sm:text-base text-background/75 leading-relaxed max-w-2xl mx-auto">{s(c.text)}</p>
      </div>
    </section>
  );
}

/** Best sellers / featured products: desktop 3 per row (6 products), mobile 2 per row. */
export function ProductsModule({
  c,
  products,
  siteMode,
}: {
  c: C;
  products: ShopProduct[];
  siteMode: SiteMode;
}) {
  if (products.length === 0) return null;
  const cta = s(c.cta_text);
  const link = s(c.cta_link);
  return (
    <section className="max-w-7xl mx-auto px-4 py-14 sm:py-20">
      <div className="flex items-end justify-between gap-4 mb-8">
        <h2 className="font-serif text-3xl sm:text-4xl">{s(c.title)}</h2>
        {cta && link && (
          <CmsLink href={link} className="text-[11px] uppercase tracking-[0.2em] font-semibold underline underline-offset-4 whitespace-nowrap">
            {cta}
          </CmsLink>
        )}
      </div>
      <div className="grid stagger grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} siteMode={siteMode} />
        ))}
      </div>
    </section>
  );
}

export function FeaturedVideoModule({ c }: { c: C }) {
  if (!s(c.video_url)) return null;
  return (
    <section className="max-w-6xl mx-auto px-4 py-14 sm:py-20">
      <VideoPlayer
        url={s(c.video_url)}
        posterDesktop={normalizeImageUrl(s(c.thumbnail_desktop))}
        posterMobile={normalizeImageUrl(s(c.thumbnail_mobile))}
        title={s(c.title)}
      />
      {(s(c.title) || s(c.text) || s(c.cta_text)) && (
        <div className="mt-6 text-center max-w-2xl mx-auto">
          {s(c.title) && <h2 className="font-serif text-2xl sm:text-3xl">{s(c.title)}</h2>}
          {s(c.text) && <p className="mt-3 text-sm text-muted leading-relaxed">{s(c.text)}</p>}
          {s(c.cta_text) && s(c.cta_link) && (
            <CmsLink href={s(c.cta_link)} className="mt-5 inline-block text-[11px] uppercase tracking-[0.2em] font-semibold underline underline-offset-4">
              {s(c.cta_text)}
            </CmsLink>
          )}
        </div>
      )}
    </section>
  );
}

export function BecomeABrandModule({ c }: { c: C }) {
  return (
    <section className="border-t border-border">
      <div className="max-w-3xl mx-auto px-4 py-16 sm:py-20 text-center">
        <h2 className="font-serif text-2xl sm:text-4xl leading-snug">{s(c.title)}</h2>
        {s(c.text) && <p className="mt-4 text-sm text-muted leading-relaxed">{s(c.text)}</p>}
        {s(c.cta_text) && s(c.cta_link) && (
          <CmsLink href={s(c.cta_link)} className={`${BUTTON} mt-8`}>
            {s(c.cta_text)}
          </CmsLink>
        )}
      </div>
    </section>
  );
}
