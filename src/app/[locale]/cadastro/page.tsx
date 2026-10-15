import { getTranslations } from "next-intl/server";
import { SignupForm } from "@/components/signup-form";

export default async function CadastroPage() {
  const t = await getTranslations("apply");

  return (
    <div className="max-w-3xl mx-auto px-4 py-14 sm:py-20">
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">{t("eyebrow")}</p>
      <h1 className="font-serif text-4xl sm:text-5xl mt-3 mb-4">{t("title")}</h1>
      <p className="text-sm text-muted mb-10 max-w-xl leading-relaxed">{t("subtitle")}</p>
      <SignupForm />
    </div>
  );
}
