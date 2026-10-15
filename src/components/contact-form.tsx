"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { submitContactMessage, type ContactState } from "@/app/[locale]/contato/actions";

const initial: ContactState = { status: "idle" };
const FIELD = "w-full border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:border-foreground";

export function ContactForm({
  subjects,
  defaultSubject,
  defaults,
}: {
  subjects: { value: string; label: string }[];
  defaultSubject: string;
  defaults?: { name?: string; email?: string };
}) {
  const t = useTranslations("contactPage");
  const locale = useLocale();
  const [state, action, pending] = useActionState(submitContactMessage, initial);

  if (state.status === "success") {
    return <p className="border border-border bg-surface p-5 text-sm">{t("success")}</p>;
  }

  return (
    <form action={action} className="grid sm:grid-cols-2 gap-4">
      <input type="hidden" name="locale" value={locale} />
      {/* honeypot */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <label className="block text-xs">
        <span className="block mb-1 uppercase tracking-[0.12em]">{t("name")} *</span>
        <input name="name" required defaultValue={defaults?.name} className={FIELD} />
      </label>
      <label className="block text-xs">
        <span className="block mb-1 uppercase tracking-[0.12em]">{t("company")}</span>
        <input name="company" className={FIELD} />
      </label>
      <label className="block text-xs">
        <span className="block mb-1 uppercase tracking-[0.12em]">{t("email")} *</span>
        <input name="email" type="email" required defaultValue={defaults?.email} className={FIELD} />
      </label>
      <label className="block text-xs">
        <span className="block mb-1 uppercase tracking-[0.12em]">{t("phone")}</span>
        <input name="phone" className={FIELD} />
      </label>
      <label className="block text-xs">
        <span className="block mb-1 uppercase tracking-[0.12em]">{t("country")}</span>
        <input name="country" className={FIELD} />
      </label>
      <label className="block text-xs">
        <span className="block mb-1 uppercase tracking-[0.12em]">{t("subject")} *</span>
        <select name="subject" required defaultValue={subjects.find((s) => s.value === defaultSubject)?.label ?? ""} className={FIELD}>
          <option value="" disabled>
            {t("chooseSubject")}
          </option>
          {subjects.map((s) => (
            <option key={s.value} value={s.label}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs sm:col-span-2">
        <span className="block mb-1 uppercase tracking-[0.12em]">{t("message")} *</span>
        <textarea name="message" required rows={6} className={FIELD} />
      </label>

      {state.status === "error" && (
        <p className="sm:col-span-2 text-sm text-accent font-medium">{state.message === "invalid" ? t("errorInvalid") : t("errorUnavailable")}</p>
      )}
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="bg-foreground text-background px-8 py-3.5 text-[11px] uppercase tracking-[0.2em] font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50">
          {pending ? t("sending") : t("send")}
        </button>
      </div>
    </form>
  );
}
