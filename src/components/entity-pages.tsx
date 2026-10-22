import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentCustomer, isApproved } from "@/lib/auth";
import { SITE_MODE_HEADER, type SiteMode } from "@/lib/site-mode";
import { ProductCard } from "@/components/product-card";
import { normalizeImageUrl } from "@/lib/image-url";
import {
  entityProductIds,
  getEntityBySlug,
  getLookbookImages,
  listEntities,
  productsByIds,
  type EntityCard,
} from "@/lib/catalog-extra";
import type { ShopProduct } from "@/lib/catalog";
import { ENTITY, type EntityKind } from "@/lib/entities";

const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.3em] text-muted";

/** Responsive card used by every index page and by the Home modules. */
export function EntityCardLink({ kind, e, partnerLabel }: { kind: EntityKind; e: EntityCard; partnerLabel: string }) {
  const cover = e.coverUrl ?? e.logoUrl ?? null;
  return (
    <Link href={`/${ENTITY[kind].siteRoute}/${e.slug}`} className="group block border border-border/70 hover:border-foreground/40 transition-colors bg-white/90">
      <div className="relative aspect-[4/5] bg-surface overflow-hidden">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={e.title} referrerPolicy="no-referrer" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700" />
        )}
        {e.partner && (
          <span className="absolute top-2.5 left-2.5 bg-background/90 px-2.5 py-1 text-[9px] uppercase tracking-[0.18em] font-semibold border border-border/80">
            {partnerLabel}: {e.partner}
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-serif text-lg sm:text-xl">{e.title}</h3>
        {e.text && <p className="mt-1.5 text-sm text-muted line-clamp-2 leading-relaxed">{e.text}</p>}
      </div>
    </Link>
  );
}

export async function EntityIndexPage({ kind }: { kind: EntityKind }) {
  const locale = await getLocale();
  const t = await getTranslations(`c2.${kind}`);
  const tc = await getTranslations("c2.common");
  const items = await listEntities(kind, locale);
  return (
    <div className="max-w-7xl mx-auto px-4 py-10 sm:py-14">
      <h1 className="font-serif text-4xl sm:text-5xl">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted leading-relaxed">{t("intro")}</p>
      {items.length === 0 ? (
        <p className="mt-10 text-sm text-muted py-16 text-center border border-dashed border-border">{t("empty")}</p>
      ) : (
        <div className="mt-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
          {items.map((e) => (
            <EntityCardLink key={e.id} kind={kind} e={e} partnerLabel={tc("partner")} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductGrid({ products, siteMode }: { products: ShopProduct[]; siteMode: SiteMode }) {
  return (
    <div className="grid stagger grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} siteMode={siteMode} priority={i < 3} />
      ))}
    </div>
  );
}

export async function EntityDetailPage({ kind, slug }: { kind: EntityKind; slug: string }) {
  const locale = await getLocale();
  const t = await getTranslations(`c2.${kind}`);
  const tc = await getTranslations("c2.common");
  const headerList = await headers();
  const siteMode = (headerList.get(SITE_MODE_HEADER) as SiteMode) ?? "internacional";
  const customer = await getCurrentCustomer();
  const approved = isApproved(customer);

  const e = await getEntityBySlug(kind, slug, locale);
  if (!e) notFound();
  const cover = e.coverUrl;
  const back = (
    <Link href={`/${ENTITY[kind].siteRoute}`} className="text-[11px] uppercase tracking-[0.2em] text-muted hover:text-foreground">
      ← {t("title")}
    </Link>
  );

  const header = (
    <header className="mb-10">
      {back}
      {cover && kind !== "lookbooks" && (
        <div className="mt-5 aspect-[16/7] bg-surface overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt={e.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="mt-6 max-w-3xl">
        {e.partner && <p className={EYEBROW}>{tc("partner")}: {e.partner}</p>}
        <div className="flex items-center gap-4">
          {e.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={e.logoUrl} alt="" referrerPolicy="no-referrer" className="h-12 w-auto object-contain" />
          )}
          <h1 className="font-serif text-4xl sm:text-5xl">{e.title}</h1>
        </div>
        {e.country && <p className={`${EYEBROW} mt-2`}>{e.country}</p>}
        {e.text && <p className="mt-5 text-sm sm:text-base text-muted leading-relaxed whitespace-pre-line">{e.text}</p>}
      </div>
    </header>
  );

  if (kind === "lookbooks") {
    const images = await getLookbookImages(e.id, locale, approved);
    return (
      <div className="max-w-6xl mx-auto px-4 py-10 sm:py-14">
        {header}
        {images.length === 0 && <p className="text-sm text-muted py-10 text-center border border-dashed border-border">{t("noImages")}</p>}
        <div className="space-y-16">
          {images.map((img) => (
            <section key={img.id} className="grid md:grid-cols-2 gap-6 md:gap-10 items-start">
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={normalizeImageUrl(img.imageUrl, 1800) ?? ""} alt={img.caption || e.title} referrerPolicy="no-referrer" loading="lazy" className="w-full h-auto" />
                {img.caption && <p className="mt-2 text-xs text-muted">{img.caption}</p>}
              </div>
              {img.products.length > 0 && (
                <div>
                  <h2 className={`${EYEBROW} mb-4`}>{t("shopTheLook")}</h2>
                  <div className="grid grid-cols-2 gap-3">
                    {img.products.map((p) => (
                      <ProductCard key={p.id} product={p} siteMode={siteMode} />
                    ))}
                  </div>
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    );
  }

  const ids = await entityProductIds(kind as "brands" | "collections" | "edits", e.id);
  const products = await productsByIds(ids, approved);
  return (
    <div className="max-w-7xl mx-auto px-4 py-10 sm:py-14">
      {header}
      {products.length === 0 ? (
        <p className="text-sm text-muted py-10 text-center border border-dashed border-border">{t("noProducts")}</p>
      ) : (
        <>
          <h2 className={`${EYEBROW} mb-5`}>{t("productsTitle")}</h2>
          <ProductGrid products={products} siteMode={siteMode} />
        </>
      )}
    </div>
  );
}
