import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { InstitutionalPage } from "@/components/institutional-page";

export default async function AtacadoPage() {
  const t = await getTranslations("wholesale");

  return (
    <InstitutionalPage title={t("title")}>
      <p className="text-sm text-muted mb-6">
        {t("subtitle")}
      </p>
      <Link
        href="/cadastro?tipo=pj"
        className="inline-block bg-accent text-white px-6 py-3 text-sm uppercase tracking-wide hover:opacity-90 mb-6 font-medium"
      >
        {t("createCta")}
      </Link>
      <div className="border border-dashed border-border p-4 text-sm text-muted">
        {t("notice")}
      </div>
    </InstitutionalPage>
  );
}
