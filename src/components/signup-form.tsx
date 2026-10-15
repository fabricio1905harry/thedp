"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { signUpCustomer, type SignUpState } from "@/app/[locale]/cadastro/actions";

const initialState: SignUpState = { status: "idle" };
const FIELD = "w-full border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:border-foreground";
const LABEL = "block text-xs uppercase tracking-[0.12em] mb-1";
const BUSINESS_TYPES = ["boutique", "multibrand", "department", "ecommerce", "showroom", "other"] as const;

/** Wholesale application (international B2B). The account starts pending and needs TDP approval. */
export function SignupForm() {
  const locale = useLocale();
  const t = useTranslations("apply");
  const [state, formAction, pending] = useActionState(signUpCustomer, initialState);
  const [sameAddress, setSameAddress] = useState(true);
  const [companyAddress, setCompanyAddress] = useState("");

  if (state.status === "success") {
    return (
      <div className="border border-border bg-surface p-6 space-y-2 max-w-xl">
        <p className="font-serif text-2xl">{t("successTitle")}</p>
        <p className="text-sm text-muted leading-relaxed">{t("successText")}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid sm:grid-cols-2 gap-x-5 gap-y-4 max-w-3xl">
      <input type="hidden" name="locale" value={locale} />

      <Field label={t("storeName")} required>
        <input name="companyName" required className={FIELD} />
      </Field>
      <Field label={t("buyerName")} required>
        <input name="name" required className={FIELD} />
      </Field>

      <Field label={t("companyAddress")} required wide>
        <textarea name="companyAddress" required rows={2} value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} className={FIELD} />
      </Field>

      <div className="sm:col-span-2 space-y-2">
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={sameAddress} onChange={(e) => setSameAddress(e.target.checked)} />
          {t("sameAddress")}
        </label>
        {sameAddress ? (
          <input type="hidden" name="deliveryAddress" value={companyAddress} />
        ) : (
          <Field label={t("deliveryAddress")} required wide>
            <textarea name="deliveryAddress" required rows={2} className={FIELD} />
          </Field>
        )}
      </div>

      <Field label={t("website")}>
        <input name="website" type="url" placeholder="https://" className={FIELD} />
      </Field>
      <Field label="Instagram">
        <input name="instagram" placeholder="@" className={FIELD} />
      </Field>

      <Field label={t("email")} required>
        <input name="email" type="email" required autoComplete="email" className={FIELD} />
      </Field>
      <Field label={t("phone")} required>
        <input name="phone" required className={FIELD} />
      </Field>

      <Field label={t("businessType")} required>
        <select name="businessType" required defaultValue="" className={FIELD}>
          <option value="" disabled>
            {t("choose")}
          </option>
          {BUSINESS_TYPES.map((k) => (
            <option key={k} value={t(`types.${k}`)}>
              {t(`types.${k}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("taxId")}>
        <input name="taxId" className={FIELD} />
      </Field>

      <Field label={t("physicalStore")}>
        <select name="hasPhysicalStore" defaultValue="" className={FIELD}>
          <option value="">—</option>
          <option value="true">{t("yes")}</option>
          <option value="false">{t("no")}</option>
        </select>
      </Field>
      <Field label={t("storeCount")}>
        <input name="storeCount" type="number" min={0} className={FIELD} />
      </Field>

      <Field label={t("brands")} wide>
        <input name="brandsCarried" className={FIELD} />
      </Field>
      <Field label={t("message")} wide>
        <textarea name="applicationMessage" rows={3} className={FIELD} />
      </Field>
      <Field label={t("referral")} wide>
        <input name="referralCode" placeholder={t("referralPlaceholder")} className={FIELD} />
      </Field>

      <Field label={t("password")} required>
        <input name="password" type="password" minLength={8} required autoComplete="new-password" className={FIELD} />
      </Field>

      <label className="sm:col-span-2 flex items-start gap-2 text-xs leading-relaxed">
        <input type="checkbox" name="applicantConfirmed" required className="mt-0.5" />
        {t("confirm")}
      </label>

      {state.status === "error" && <p className="sm:col-span-2 text-sm text-accent font-medium">{state.message}</p>}

      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="bg-foreground text-background px-8 py-3.5 text-[11px] uppercase tracking-[0.2em] font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50">
          {pending ? t("submitting") : t("submit")}
        </button>
      </div>
    </form>
  );
}

function Field({ label, required, wide, children }: { label: string; required?: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className={LABEL}>
        {label}
        {required && " *"}
      </span>
      {children}
    </label>
  );
}
