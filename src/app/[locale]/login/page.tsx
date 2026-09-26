import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const t = await getTranslations("nav");
  return (
    <div className="max-w-3xl mx-auto px-4 py-14">
      <h1 className="font-serif text-3xl mb-8">{t("login")}</h1>
      <LoginForm />
    </div>
  );
}
