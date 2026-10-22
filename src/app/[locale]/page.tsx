import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { adaptCtaForSignedIn } from "@/lib/cta-signed-in";
import { getShopCatalog, pickBestSellers, pickBySlugs } from "@/lib/catalog";
import { getCurrentCustomer, isApproved } from "@/lib/auth";
import { getPublicBlocks } from "@/lib/cms";
import { operationForSiteMode } from "@/lib/cms-types";
import { SITE_MODE_HEADER, type SiteMode } from "@/lib/site-mode";
import { Reveal } from "@/components/reveal";
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

  const tNav = await getTranslations("nav");
  const blocks = adaptCtaForSignedIn(await getPublicBlocks("home", operationForSiteMode(siteMode), locale), {
    signedIn: Boolean(customer),
    approved,
    myAccountLabel: tNav("minhaConta"),
  });
  const needsCatalog = blocks.some((b) => b.key === "best_sellers" || b.key === "featured_products");
  const catalog = needsCatalog ? await getShopCatalog(approved) : [];

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
