import { AdminNewPasswordForm } from "@/components/admin-new-password-form";

export const metadata = { title: "Nova senha — Admin" };

/**
 * Landing page of the recovery link (/api/auth/callback signs the person in first). Without a staff session the
 * layout shows the login screen instead, where a new link can be requested.
 */
export default function AdminResetPasswordPage() {
  return (
    <div className="max-w-sm space-y-4">
      <div>
        <h1 className="font-serif text-2xl mb-1">Criar nova senha</h1>
        <p className="text-sm text-muted">Escolha uma senha nova para entrar no painel.</p>
      </div>
      <AdminNewPasswordForm />
    </div>
  );
}
