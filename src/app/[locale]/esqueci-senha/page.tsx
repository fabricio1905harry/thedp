import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ta = await getTranslations("auth");
  const { error } = await searchParams;
  return (
    <div className="max-w-3xl mx-auto px-4 py-14">
      <h1 className="font-serif text-3xl mb-8">{ta("resetTitle")}</h1>
      <ForgotPasswordForm expired={error === "expired"} />
    </div>
  );
}
