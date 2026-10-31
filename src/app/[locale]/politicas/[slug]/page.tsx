import { notFound } from "next/navigation";
import { CmsPage } from "@/components/cms-page";
import { EXTRA_PAGES, pageTitle } from "@/lib/page-titles";

export default async function ExtraPolicyPage({ params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params;
  const page = EXTRA_PAGES[slug];
  if (!page) notFound();
  return <CmsPage pageKey={page.pageKey} fallbackTitle={pageTitle(page.title, locale)} />;
}
