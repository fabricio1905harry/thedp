import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { Header } from "@/components/header";
import { Footer, type FooterContent } from "@/components/footer";
import { CookieNotice } from "@/components/cookie-notice";
import type { SiteMode } from "@/lib/site-mode";
import { getCurrentCustomer } from "@/lib/auth";
import { getPublicBlocks } from "@/lib/cms";
import { operationForSiteMode } from "@/lib/cms-types";

const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function SiteChrome({
  siteMode,
  children,
}: {
  siteMode: SiteMode;
  children: ReactNode;
}) {
  const [customer, locale, tFooter] = await Promise.all([getCurrentCustomer(), getLocale(), getTranslations("footer")]);
  const blocks = await getPublicBlocks("site", operationForSiteMode(siteMode), locale).catch(() => []);
  const block = (key: string) => blocks.find((b) => b.key === key)?.content ?? null;

  const footer = block("footer");
  const social = block("social");
  const newsletter = block("newsletter");
  const cookie = block("cookie_notice");

  const content: FooterContent = {
    tagline: str(footer?.tagline),
    links: Array.isArray(footer?.links)
      ? (footer.links as Record<string, unknown>[]).map((l) => ({ group: str(l.group), label: str(l.label), href: str(l.href) }))
      : [],
    social: social
      ? { whatsapp: str(social.whatsapp), email: str(social.email), instagram: str(social.instagram), linkedin: str(social.linkedin) }
      : null,
    newsletter: newsletter
      ? {
          title: str(newsletter.title),
          text: str(newsletter.text),
          placeholder: str(newsletter.placeholder),
          button: str(newsletter.button),
          success: str(newsletter.success),
        }
      : null,
    nationalNotice: tFooter("nationalNotice"),
  };

  return (
    <>
      <Header siteMode={siteMode} />
      <main className="flex-1">{children}</main>
      <Footer siteMode={siteMode} signedIn={Boolean(customer)} content={content} />
      {cookie && (
        <CookieNotice
          text={str(cookie.text)}
          accept={str(cookie.accept)}
          linkLabel={str(cookie.link_label)}
          link={str(cookie.link)}
        />
      )}
    </>
  );
}
