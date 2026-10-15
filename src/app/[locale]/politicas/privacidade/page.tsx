import { getTranslations } from "next-intl/server";
import { CmsPage } from "@/components/cms-page";

export default async function PrivacidadePage() {
  const t = await getTranslations("institutional");
  return <CmsPage pageKey="privacy" fallbackTitle={t("titles.privacidade")} />;
}
