import { getLocale } from "next-intl/server";
import { CmsPage } from "@/components/cms-page";
import { pageTitle } from "@/lib/page-titles";

export default async function HowItWorksPage() {
  const locale = await getLocale();
  return <CmsPage pageKey="how_it_works_page" fallbackTitle={pageTitle({ en: "How it works", es: "Cómo funciona", pt: "Como funciona" }, locale)} />;
}
