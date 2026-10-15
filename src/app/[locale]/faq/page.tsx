import { getTranslations } from "next-intl/server";
import { CmsPage } from "@/components/cms-page";

export default async function FaqPage() {
  const t = await getTranslations("institutional");
  return <CmsPage pageKey="faq" fallbackTitle={t("titles.faq")} />;
}
