import { getTranslations } from "next-intl/server";
import { InstitutionalPage } from "@/components/institutional-page";

export default async function SobrePage() {
  const t = await getTranslations("institutional");
  return <InstitutionalPage title={t("titles.sobre")} pendingContent />;
}
