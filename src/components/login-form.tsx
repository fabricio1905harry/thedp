"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { login, type LoginState } from "@/app/[locale]/login/actions";

const initialState: LoginState = { status: "idle" };

export function LoginForm({ resetDone = false }: { resetDone?: boolean }) {
  const locale = useLocale();
  const t = useTranslations("nav");
  const ta = useTranslations("auth");
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="space-y-4 max-w-sm">
      <input type="hidden" name="locale" value={locale} />
      {resetDone && <p className="text-sm border border-border bg-surface px-3 py-2">{ta("passwordUpdated")}</p>}
      <div>
        <label className="block text-sm mb-1" htmlFor="email">{ta("email")}</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="w-full border border-border px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="password">{ta("password")}</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className="w-full border border-border px-3 py-2 text-sm" />
        <p className="mt-2 text-right">
          <Link href="/esqueci-senha" className="text-xs underline text-muted hover:text-foreground">
            {ta("forgot")}
          </Link>
        </p>
      </div>

      {state.status === "error" && state.code && (
        <p role="alert" className="text-sm text-accent">{ta(state.code)}</p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full py-3 text-sm uppercase tracking-wide">
        {pending ? ta("signingIn") : t("login")}
      </button>
    </form>
  );
}
