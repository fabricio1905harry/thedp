"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { deleteAddress } from "@/app/[locale]/minha-conta/enderecos/actions";

interface Address {
  id: string;
  country: string;
  state: string | null;
  city: string | null;
  line1: string;
  line2: string | null;
  postal_code: string | null;
  phone: string | null;
}

export function AddressList({ addresses }: { addresses: Address[] }) {
  const t = useTranslations("address");
  const [pending, startTransition] = useTransition();

  if (addresses.length === 0) {
    return <p className="text-sm text-muted mb-8">{t("empty")}</p>;
  }

  return (
    <div className="space-y-3 mb-8">
      {addresses.map((a) => (
        <div key={a.id} className="border border-border rounded-sm p-4 flex justify-between items-start">
          <div className="text-sm">
            <p>{a.line1}{a.line2 ? `, ${a.line2}` : ""}</p>
            <p className="text-muted">
              {[a.city, a.state, a.postal_code, a.country].filter(Boolean).join(", ")}
            </p>
            {a.phone && <p className="text-muted">{a.phone}</p>}
          </div>
          <button
            disabled={pending}
            onClick={() => startTransition(() => deleteAddress(a.id))}
            className="text-xs text-muted hover:text-accent disabled:opacity-50"
          >
            {t("remove")}
          </button>
        </div>
      ))}
    </div>
  );
}
