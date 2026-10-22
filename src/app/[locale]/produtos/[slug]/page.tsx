import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { Link } from "@/i18n/navigation";
import { getProductDetail } from "@/lib/catalog";
import { ProductGallery } from "@/components/product-gallery";
import { getCurrentCustomer, isApproved } from "@/lib/auth";
import { SITE_MODE_HEADER, type SiteMode } from "@/lib/site-mode";
import { ProductPurchasePanel } from "@/components/product-purchase-panel";
import { WhatsAppContextSetter } from "@/components/whatsapp-button";
import { getWhatsAppSettings } from "@/lib/settings";
import { getPublicBlock } from "@/lib/cms";
import { operationForSiteMode } from "@/lib/cms-types";

function Accordion({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-t border-border last:border-b">
      <summary className="flex items-center justify-between cursor-pointer py-4 text-[11px] font-semibold uppercase tracking-[0.22em] list-none">
        {title}
        <span className="text-base font-normal group-open:rotate-45 transition-transform">+</span>
      </summary>
      <div className="pb-5 text-sm text-muted leading-relaxed space-y-2">{children}</div>
    </details>
  );
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale } = await params;
  const t = await getTranslations("product");
  const headerList = await headers();
  const siteMode = (headerList.get(SITE_MODE_HEADER) as SiteMode) ?? "internacional";
  const customer = await getCurrentCustomer();
  const approved = isApproved(customer);

  const product = await getProductDetail(slug, approved);
  if (!product) notFound();

  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const productUrl = `${proto}://${host}/${locale}/produtos/${product.slug}`;

  // Contact channels for the "exact color" help (same source as the Contact page)
  const contact = await getPublicBlock("contact", "intro", operationForSiteMode(siteMode), locale);
  const wa = await getWhatsAppSettings();
  const waRaw = (typeof contact?.whatsapp === "string" && contact.whatsapp.trim()) || wa?.number || "";
  const waHref = waRaw ? (/^https?:/.test(waRaw) ? waRaw : `https://wa.me/${waRaw.replace(/\D/g, "")}`) : "";
  const email = typeof contact?.email === "string" ? contact.email.trim() : "";

  const underReview = customer && (customer.status === "pending" || customer.status === "more_info");

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 sm:py-14 grid md:grid-cols-2 gap-10 lg:gap-16">
      <WhatsAppContextSetter
        context={{ kind: "product", product: { name: product.title, code: product.reference ?? product.slug, url: productUrl } }}
      />
      <ProductGallery images={product.images} crops={product.imageCrops} slug={product.slug} title={product.title} />

      <div>
        <p className="text-[11px] uppercase tracking-[0.25em] text-muted">{product.category}</p>
        <h1 className="font-serif text-3xl sm:text-4xl mt-2">{product.title}</h1>
        {product.reference && <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted">{product.reference}</p>}

        <div className="mt-8">
          {siteMode === "nacional" ? (
            <p className="text-sm text-muted">{t("internationalOnly")}</p>
          ) : approved ? (
            <ProductPurchasePanel product={product} />
          ) : underReview ? (
            <p className="text-sm font-medium border border-border bg-surface p-4">{t("accountUnderReview")}</p>
          ) : (
            <div className="space-y-3">
              <Link
                href="/cadastro"
                className="inline-block bg-foreground text-background px-8 py-3.5 text-[11px] uppercase tracking-[0.2em] font-semibold hover:bg-accent-hover transition-colors"
              >
                {t("viewWholesalePrice")}
              </Link>
              <p className="text-xs text-muted leading-relaxed max-w-sm">
                {t("wholesaleReserved")}{" "}
                <Link href="/login" className="underline text-foreground">
                  {t("signIn")}
                </Link>
              </p>
            </div>
          )}
        </div>

        {siteMode === "internacional" && (
          <div className="mt-8 space-y-4">
            <div className="border border-border p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em]">{t("readyToShip")}</p>
              <p className="mt-1 text-xs text-muted">{t("availabilityMoves")}</p>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              <span className="font-medium text-foreground">{t("colorHelpTitle")}</span> {t("colorHelpBase")}
              {waHref || email ? (
                <>
                  {" "}
                  {t("colorHelpVia")}{" "}
                  {waHref && (
                    <a href={waHref} target="_blank" rel="noopener noreferrer" className="underline text-foreground">
                      WhatsApp
                    </a>
                  )}
                  {waHref && email && ` ${t("colorHelpOr")} `}
                  {email && (
                    <a href={`mailto:${email}`} className="underline text-foreground">
                      {email}
                    </a>
                  )}
                  .
                </>
              ) : (
                <>
                  {" "}
                  <Link href="/contato" className="underline text-foreground">
                    {t("colorHelpContactPage")}
                  </Link>
                  .
                </>
              )}
            </p>
          </div>
        )}

        <div className="mt-10">
          <Accordion title={t("accDetails")} open>
            {product.description && <p>{product.description}</p>}
            <p>
              <span className="text-foreground">{t("countryOfOrigin")}:</span> {t("brazil")}
            </p>
          </Accordion>
          <Accordion title={t("accSizeFit")}>
            <p>{t("sizeFitText")}</p>
          </Accordion>
          {siteMode === "internacional" && (
            <>
              <Accordion title={t("accShipping")}>
                <p>{t("shippingText")}</p>
                <p>
                  <Link href="/contato?subject=shipping" className="underline text-foreground">
                    {t("shippingLearn")}
                  </Link>
                </p>
              </Accordion>
              <Accordion title={t("accReserve")}>
                <p>{t("reserveText")}</p>
                <p>
                  <Link href="/reserve-for-later-delivery" className="underline text-foreground">
                    {t("reserveLearn")}
                  </Link>
                </p>
              </Accordion>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
