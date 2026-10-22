import { CmsLink } from "@/components/cms-link";
import { Link } from "@/i18n/navigation";
import { EntityCardLink } from "@/components/entity-pages";
import { ProductsModule } from "@/components/home/modules";
import type { EntityCard } from "@/lib/catalog-extra";
import type { EntityKind } from "@/lib/entities";
import type { ShopProduct } from "@/lib/catalog";
import type { SiteMode } from "@/lib/site-mode";

type C = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");

/** Featured Brands / Lookbooks / TDP Edits: a row of entity cards. Renders nothing when empty. */
export function EntityShowcaseModule({
  kind,
  c,
  items,
  partnerLabel,
}: {
  kind: EntityKind;
  c: C;
  items: EntityCard[];
  partnerLabel: string;
}) {
  if (items.length === 0) return null;
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
        {items.map((e) => (
          <EntityCardLink key={e.id} kind={kind} e={e} partnerLabel={partnerLabel} />
        ))}
      </div>
    </section>
  );
}

/** Featured Collection: cover + story, then its products. */
export function FeaturedCollectionModule({
  c,
  collection,
  products,
  siteMode,
}: {
  c: C;
  collection: EntityCard | null;
  products: ShopProduct[];
  siteMode: SiteMode;
}) {
  if (!collection) return null;
  const title = s(c.title) || collection.title;
  return (
    <div>
      {collection.coverUrl && (
        <section className="max-w-7xl mx-auto px-4 pt-14 sm:pt-20">
          <Link href={`/colecoes/${collection.slug}`} className="block relative aspect-[16/8] bg-surface overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={collection.coverUrl} alt={title} referrerPolicy="no-referrer" loading="lazy" className="w-full h-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent p-6 sm:p-10 text-white">
              <h2 className="font-serif text-3xl sm:text-5xl">{title}</h2>
              {collection.text && <p className="mt-2 max-w-xl text-sm text-white/90 line-clamp-2">{collection.text}</p>}
            </div>
          </Link>
        </section>
      )}
      <ProductsModule
        c={{ title: collection.coverUrl ? "" : title, cta_text: s(c.cta_text), cta_link: `/colecoes/${collection.slug}` }}
        products={products}
        siteMode={siteMode}
      />
    </div>
  );
}
