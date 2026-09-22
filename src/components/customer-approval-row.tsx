"use client";

import { useTransition } from "react";
import { setCustomerStatus } from "@/app/admin/clientes/actions";

export function CustomerApprovalRow({
  customer,
}: {
  customer: {
    id: string;
    email: string;
    name: string | null;
    created_at: string;
    customer_type?: string;
    company_name?: string | null;
  };
}) {
  const [pending, startTransition] = useTransition();
  const isBusiness = customer.customer_type === "business";

  return (
    <tr className="border-b border-border">
      <td className="py-2 pr-4">{customer.name ?? "—"}</td>
      <td className="py-2 pr-4">
        {isBusiness ? (
          <span className="text-xs bg-accent/10 text-accent px-2 py-0.5">
            Business{customer.company_name ? ` · ${customer.company_name}` : ""}
          </span>
        ) : (
          <span className="text-xs text-muted">Individual</span>
        )}
      </td>
      <td className="py-2 pr-4">{customer.email}</td>
      <td className="py-2 pr-4 text-muted">
        {new Date(customer.created_at).toLocaleDateString("pt-BR")}
      </td>
      <td className="py-2 flex gap-2">
        <button
          disabled={pending}
          onClick={() => startTransition(() => setCustomerStatus(customer.id, "approved"))}
          className="text-xs bg-accent text-white px-3 py-1.5 disabled:opacity-50"
        >
          Aprovar
        </button>
        <button
          disabled={pending}
          onClick={() => startTransition(() => setCustomerStatus(customer.id, "rejected"))}
          className="text-xs border border-border px-3 py-1.5 disabled:opacity-50"
        >
          Recusar
        </button>
      </td>
    </tr>
  );
}
