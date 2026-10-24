import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewPasswordForm } from "@/components/new-password-form";

export default async function ResetPasswordPage() {
  const ta = await getTranslations("auth");
  // the recovery link (see /api/auth/callback) already signed the buyer in
  let signedIn = false;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      signedIn = Boolean(data.user);
    } catch {
      signedIn = false;
    }
  }
  return (
    <div className="max-w-3xl mx-auto px-4 py-14">
      <h1 className="font-serif text-3xl mb-8">{ta("newPasswordTitle")}</h1>
      {signedIn ? (
        <NewPasswordForm />
      ) : (
        <div className="space-y-4 max-w-sm">
          <p role="alert" className="text-sm text-accent">{ta("linkExpired")}</p>
          <Link href="/esqueci-senha" className="btn-primary inline-block px-5 py-3 text-sm uppercase tracking-wide">{ta("requestNewLink")}</Link>
        </div>
      )}
    </div>
  );
}
