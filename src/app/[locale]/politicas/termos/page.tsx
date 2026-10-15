import { getTranslations } from "next-intl/server";
import { CmsPage } from "@/components/cms-page";

export default async function TermosPage() {
  const t = await getTranslations("institutional");
  return <CmsPage pageKey="terms" fallbackTitle={t("titles.termos")} />;
}
