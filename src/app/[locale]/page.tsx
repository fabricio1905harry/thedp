import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { getShopCatalog, pickBestSellers, pickBySlugs } from "@/lib/catalog";
import { getCurrentCustomer, isApproved } from "@/lib/auth";
import { getPublicBlocks } from "@/lib/cms";
import { operationForSiteMode } from "@/lib/cms-types";
import { SITE_MODE_HEADER, type SiteMode } from "@/lib/site-mode";
import { Reveal } from "@/components/reveal";
import { EntityShowcaseModule, FeaturedCollectionModule } from "@/components/home/catalog-modules";
import { entityProductIds, getEntityBySlug, listEntities, productsByIds } from "@/lib/catalog-extra";
import {
  BecomeABrandModule,
  FeaturedVideoModule,
  HeroModule,
  HowItWorksModule,
  InstitutionalBannerModule,
  ProductsModule,
  ReadyToShipModule,
  StartSmallModule,
} from "@/components/home/modules";

/**
 * Home is assembled from CMS modules (Admin → Conteúdo do site → Home):
 * each one can be turned ON/OFF, reordered, limited by operation and edited
 * in EN/ES/PT without a developer.
 */
export default async function HomePage() {
  const locale = await getLocale();
  const headerList = await headers();
  const siteMode = (headerList.get(SITE_MODE_HEADER) as SiteMode) ?? "internacional";
  const customer = await getCurrentCustomer();
  const approved = isApproved(customer);

  const blocks = await getPublicBlocks("home", operationForSiteMode(siteMode), locale);
  const needsCatalog = blocks.some((b) => b.key === "best_sellers" || b.key === "featured_products");
  const catalog = needsCatalog ? await getShopCatalog(approved) : [];

  const tc = await getTranslations("c2.common");
  const partnerLabel = tc("partner");

  // Catalog phase 2 modules (data only fetched when the module is on)
  const countOf = (content: Record<string, unknown>, fallback: number) => Number(content.count) || fallback;
  const blockContent = (k: string) => blocks.find((b) => b.key === k)?.content;
  const brandsC = blockContent("featured_brands");
  const lookbooksC = blockContent("featured_lookbooks");
  const editsC = blockContent("tdp_edits");
  const collectionC = blockContent("featured_collection");
  const [brandCards, lookbookCards, editCards] = await Promise.all([
    brandsC ? listEntities("brands", locale, { featuredOnly: true, limit: countOf(brandsC, 4) }) : [],
    lookbooksC ? listEntities("lookbooks", locale, { featuredOnly: true, limit: countOf(lookbooksC, 3) }) : [],
    editsC ? listEntities("edits", locale, { featuredOnly: true, limit: countOf(editsC, 3) }) : [],
  ]);
  let collectionCard = null;
  let collectionProducts: Awaited<ReturnType<typeof productsByIds>> = [];
  if (collectionC) {
    const wanted = typeof collectionC.slug === "string" ? collectionC.slug.trim() : "";
    collectionCard = wanted
      ? await getEntityBySlug("collections", wanted, locale)
      : ((await listEntities("collections", locale, { featuredOnly: true, limit: 1 }))[0] ?? null);
    if (collectionCard) {
      const ids = await entityProductIds("collections", collectionCard.id);
      collectionProducts = (await productsByIds(ids, approved)).slice(0, countOf(collectionC, 6));
    }
  }

  return (
    <div>
      {blocks.map(({ key, content }) => {
        const node = (() => {
        switch (key) {
          case "hero":
            return <HeroModule key={key} c={content} />;
          case "institutional_banner":
            return <InstitutionalBannerModule key={key} c={content} />;
          case "ready_to_ship":
            return <ReadyToShipModule key={key} c={content} />;
          case "how_it_works":
            return <HowItWorksModule key={key} c={content} />;
          case "start_small":
            return <StartSmallModule key={key} c={content} />;
          case "best_sellers": {
            const count = Number(content.count) || 6;
            const products =
              content.mode === "manual"
                ? pickBySlugs(catalog, (content.slugs as string[]) ?? [], count)
                : pickBestSellers(catalog, count);
            return <ProductsModule key={key} c={content} products={products} siteMode={siteMode} />;
          }
          case "featured_products": {
            const slugs = (content.slugs as string[]) ?? [];
            const featured =
              slugs.length > 0
                ? pickBySlugs(catalog, slugs, Number(content.count) || 6)
                : catalog.filter((p) => p.isFeatured).slice(0, Number(content.count) || 6);
            return (
              <ProductsModule
                key={key}
                c={content}
                products={featured}
                siteMode={siteMode}
              />
            );
          }
          case "featured_brands":
            return <EntityShowcaseModule key={key} kind="brands" c={content} items={brandCards} partnerLabel={partnerLabel} />;
          case "featured_collection":
            return <FeaturedCollectionModule key={key} c={content} collection={collectionCard} products={collectionProducts} siteMode={siteMode} />;
          case "featured_lookbooks":
            return <EntityShowcaseModule key={key} kind="lookbooks" c={content} items={lookbookCards} partnerLabel={partnerLabel} />;
          case "tdp_edits":
            return <EntityShowcaseModule key={key} kind="edits" c={content} items={editCards} partnerLabel={partnerLabel} />;
          case "featured_video":
            return <FeaturedVideoModule key={key} c={content} />;
          case "become_a_brand":
            return <BecomeABrandModule key={key} c={content} />;
          default:
            return null;
        }
        })();
        return node && key !== "hero" ? <Reveal key={key}>{node}</Reveal> : node;
      })}
    </div>
  );
}
