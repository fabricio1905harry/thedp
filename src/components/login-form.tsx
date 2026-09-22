"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { login, type LoginState } from "@/app/[locale]/login/actions";

const initialState: LoginState = { status: "idle" };

export function LoginForm() {
  const locale = useLocale();
  const t = useTranslations("nav");
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="space-y-4 max-w-sm">
      <input type="hidden" name="locale" value={locale} />
      <div>
        <label className="block text-sm mb-1" htmlFor="email">E-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full border border-border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="password">Senha</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="w-full border border-border px-3 py-2 text-sm"
        />
      </div>

      {state.status === "error" && (
        <p className="text-sm text-accent">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-accent text-white py-3 text-sm uppercase tracking-wide disabled:opacity-50"
      >
        {pending ? "Entrando..." : t("login")}
      </button>
    </form>
  );
}
