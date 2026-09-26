import { getTranslations } from "next-intl/server";
import { InstitutionalPage } from "@/components/institutional-page";

export default async function PrivacidadePage() {
  const t = await getTranslations("institutional");
  return <InstitutionalPage title={t("titles.privacidade")} pendingContent />;
}
