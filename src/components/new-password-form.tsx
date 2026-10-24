"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { updatePassword, type NewPasswordState } from "@/app/[locale]/login/actions";

const initial: NewPasswordState = { status: "idle" };

export function NewPasswordForm() {
  const locale = useLocale();
  const ta = useTranslations("auth");
  const [state, action, pending] = useActionState(updatePassword, initial);

  return (
    <form action={action} className="space-y-4 max-w-sm">
      <input type="hidden" name="locale" value={locale} />
      <div>
        <label className="block text-sm mb-1" htmlFor="password">{ta("newPassword")}</label>
        <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="w-full border border-border px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="confirm">{ta("confirmPassword")}</label>
        <input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" className="w-full border border-border px-3 py-2 text-sm" />
      </div>
      {state.status === "error" && state.code && (
        <p role="alert" className="text-sm text-accent">
          {ta(state.code)}{" "}
          {state.code === "linkExpired" && (
            <Link href="/esqueci-senha" className="underline">{ta("requestNewLink")}</Link>
          )}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full py-3 text-sm uppercase tracking-wide">
        {pending ? ta("saving") : ta("savePassword")}
      </button>
    </form>
  );
}
