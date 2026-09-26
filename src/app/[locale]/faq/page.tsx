import { getTranslations } from "next-intl/server";
import { InstitutionalPage } from "@/components/institutional-page";

export default async function FaqPage() {
  const t = await getTranslations("institutional");
  return <InstitutionalPage title={t("titles.faq")} pendingContent />;
}
