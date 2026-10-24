"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { requestPasswordReset, type ResetRequestState } from "@/app/[locale]/login/actions";

const initial: ResetRequestState = { status: "idle" };

export function ForgotPasswordForm({ expired = false }: { expired?: boolean }) {
  const locale = useLocale();
  const ta = useTranslations("auth");
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  return (
    <form action={action} className="space-y-4 max-w-sm">
      <input type="hidden" name="locale" value={locale} />
      {expired && state.status === "idle" && <p role="alert" className="text-sm text-accent">{ta("linkExpired")}</p>}
      <p className="text-sm text-muted">{ta("resetIntro")}</p>
      {state.status === "sent" ? (
        <p role="status" className="text-sm border border-border bg-surface px-3 py-2">{ta("resetSent")}</p>
      ) : (
        <>
          <div>
            <label className="block text-sm mb-1" htmlFor="email">{ta("email")}</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="w-full border border-border px-3 py-2 text-sm" />
          </div>
          {state.status === "error" && state.code && <p role="alert" className="text-sm text-accent">{ta(state.code)}</p>}
          <button type="submit" disabled={pending} className="btn-primary w-full py-3 text-sm uppercase tracking-wide">
            {pending ? ta("resetSending") : ta("resetSend")}
          </button>
        </>
      )}
      <p className="text-center">
        <Link href="/login" className="text-xs underline text-muted hover:text-foreground">{ta("backToLogin")}</Link>
      </p>
    </form>
  );
}
