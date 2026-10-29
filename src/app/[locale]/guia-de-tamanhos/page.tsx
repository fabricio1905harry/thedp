import { getLocale } from "next-intl/server";
import { CmsPage } from "@/components/cms-page";
import { SizeChartTable } from "@/components/size-guide";
import { getSizeChart } from "@/lib/catalog-extra";
import { pageTitle } from "@/lib/page-titles";

export default async function SizeGuidePage() {
  const locale = await getLocale();
  const chart = await getSizeChart(locale);
  return (
    <>
      <CmsPage pageKey="size_guide" fallbackTitle={pageTitle({ en: "Size guide", es: "Guía de tallas", pt: "Guia de tamanhos" }, locale)} />
      <div className="max-w-3xl mx-auto px-4 pb-14">
        <SizeChartTable chart={chart} />
      </div>
    </>
  );
}
