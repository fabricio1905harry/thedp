"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { signUpCustomer, type SignUpState } from "@/app/[locale]/cadastro/actions";

const initialState: SignUpState = { status: "idle" };

export function SignupForm({ defaultCustomerType = "individual" }: { defaultCustomerType?: "individual" | "business" }) {
  const locale = useLocale();
  const t = useTranslations("signup");
  const [customerType, setCustomerType] = useState<"individual" | "business">(defaultCustomerType);
  const [state, formAction, pending] = useActionState(signUpCustomer, initialState);

  if (state.status === "success") {
    return (
      <p className="text-sm bg-surface border border-border rounded-sm p-4">
        {t("success")}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4 max-w-sm">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="customerType" value={customerType} />

      <div className="flex gap-2 mb-2">
        <TypeButton
          label={t("individual")}
          active={customerType === "individual"}
          onClick={() => setCustomerType("individual")}
        />
        <TypeButton
          label={t("business")}
          active={customerType === "business"}
          onClick={() => setCustomerType("business")}
        />
      </div>

      <div>
        <label className="block text-sm mb-1" htmlFor="name">
          {customerType === "business" ? t("contactName") : t("name")}
        </label>
        <input
          id="name"
          name="name"
          required
          className="w-full border border-border px-3 py-2 text-sm"
        />
      </div>

      {customerType === "business" && (
        <>
          <div>
            <label className="block text-sm mb-1" htmlFor="companyName">{t("companyName")}</label>
            <input
              id="companyName"
              name="companyName"
              required
              className="w-full border border-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm mb-1" htmlFor="taxId">{t("taxId")}</label>
            <input
              id="taxId"
              name="taxId"
              required
              className="w-full border border-border px-3 py-2 text-sm"
            />
          </div>
        </>
      )}

      <div>
        <label className="block text-sm mb-1" htmlFor="email">{t("email")}</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full border border-border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm mb-1" htmlFor="password">{t("password")}</label>
        <input
          id="password"
          name="password"
          type="password"
          minLength={8}
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
        className="btn-primary w-full py-3 text-sm uppercase tracking-wide font-medium"
      >
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}

function TypeButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-3 py-1.5 border ${
        active ? "border-accent text-accent" : "border-border text-muted"
      }`}
    >
      {label}
    </button>
  );
}
