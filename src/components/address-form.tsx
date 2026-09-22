"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { addAddress } from "@/app/[locale]/minha-conta/enderecos/actions";

export function AddressForm() {
  const t = useTranslations("address");
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    country: "",
    state: "",
    city: "",
    line1: "",
    line2: "",
    postalCode: "",
    phone: "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await addAddress(form);
      setForm({ country: "", state: "", city: "", line1: "", line2: "", postalCode: "", phone: "" });
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <Field label={t("country")}>
        <input
          required
          value={form.country}
          onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
          className="w-full border border-border px-3 py-2 text-sm"
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t("state")}>
          <input
            value={form.state}
            onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
            className="w-full border border-border px-3 py-2 text-sm"
          />
        </Field>
        <Field label={t("city")}>
          <input
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            className="w-full border border-border px-3 py-2 text-sm"
          />
        </Field>
      </div>
      <Field label={t("line1")}>
        <input
          required
          value={form.line1}
          onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))}
          className="w-full border border-border px-3 py-2 text-sm"
        />
      </Field>
      <Field label={t("line2")}>
        <input
          value={form.line2}
          onChange={(e) => setForm((f) => ({ ...f, line2: e.target.value }))}
          className="w-full border border-border px-3 py-2 text-sm"
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t("postalCode")}>
          <input
            value={form.postalCode}
            onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
            className="w-full border border-border px-3 py-2 text-sm"
          />
        </Field>
        <Field label={t("phone")}>
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full border border-border px-3 py-2 text-sm"
          />
        </Field>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="bg-accent text-white px-4 py-2 text-sm uppercase tracking-wide font-medium disabled:opacity-50"
      >
        {pending ? t("saving") : t("save")}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm mb-1">{label}</span>
      {children}
    </label>
  );
}
