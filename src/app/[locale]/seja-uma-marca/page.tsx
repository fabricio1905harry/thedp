import { getLocale } from "next-intl/server";
import { CmsPage } from "@/components/cms-page";
import { BrandApplicationForm } from "@/components/brand-application-form";
import { pageTitle } from "@/lib/page-titles";

export default async function BecomeABrandPage() {
  const locale = await getLocale();
  return (
    <>
      <CmsPage pageKey="become_brand" fallbackTitle={pageTitle({ en: "Become a brand", es: "Ser una marca", pt: "Seja uma marca" }, locale)} />
      <div className="max-w-3xl mx-auto px-4 pb-14">
        <BrandApplicationForm />
      </div>
    </>
  );
}
