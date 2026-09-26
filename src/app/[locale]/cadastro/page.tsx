import { getTranslations } from "next-intl/server";
import { SignupForm } from "@/components/signup-form";

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  const defaultCustomerType = tipo === "pj" ? "business" : "individual";
  const t = await getTranslations("signup");

  return (
    <div className="max-w-3xl mx-auto px-4 py-14">
      <h1 className="font-serif text-3xl mb-2">{t("pageTitle")}</h1>
      <p className="text-sm text-muted mb-8 max-w-md">{t("pageSubtitle")}</p>
      <SignupForm defaultCustomerType={defaultCustomerType} />
    </div>
  );
}
