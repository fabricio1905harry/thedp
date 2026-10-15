import { getTranslations } from "next-intl/server";
import { CmsPage } from "@/components/cms-page";

export default async function TrocasPage() {
  const t = await getTranslations("institutional");
  return <CmsPage pageKey="returns" fallbackTitle={t("titles.trocas")} />;
}
