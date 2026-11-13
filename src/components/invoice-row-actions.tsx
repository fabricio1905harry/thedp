"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateInvoiceAction } from "@/app/admin/invoice/actions";

/** Download + "Regerar PDF" of one invoice in the Admin list. */
export function InvoiceRowActions({ invoiceId, orderId, hasPdf }: { invoiceId: string; orderId: string; hasPdf: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  function regenerate() {
    setMessage(null);
    startTransition(async () => {
      const result = await generateInvoiceAction(orderId, true);
      setMessage({ error: Boolean(result.error), text: result.error ?? result.info ?? "OK" });
      if (!result.error) router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {hasPdf ? (
        <a href={`/api/documents/invoice/${invoiceId}`} target="_blank" rel="noopener noreferrer" className="underline">
          Abrir PDF
        </a>
      ) : (
        <span className="text-muted">sem PDF</span>
      )}
      <button type="button" disabled={pending} onClick={regenerate} className="underline disabled:opacity-40">
        {pending ? "Regerando…" : "Regerar PDF"}
      </button>
      {message && <span className={`w-full text-[11px] ${message.error ? "text-red-700" : "text-muted"}`}>{message.text}</span>}
    </div>
  );
}
