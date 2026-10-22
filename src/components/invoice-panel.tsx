"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateInvoiceAction } from "@/app/admin/invoice/actions";

export function InvoicePanel({ orderId, canIssue, invoice }: { orderId: string; canIssue: boolean; invoice: { id: string; number: string; issued_at: string } | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  function run(regenerate: boolean) {
    setMessage(null);
    startTransition(async () => {
      const result = await generateInvoiceAction(orderId, regenerate);
      setMessage({ error: Boolean(result.error), text: result.error ?? result.info ?? "OK" });
      if (!result.error) router.refresh();
    });
  }

  return (
    <section className="border border-border p-4 space-y-2">
      <h2 className="text-xs uppercase tracking-wider font-semibold">Commercial invoice</h2>
      {invoice ? (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <strong>{invoice.number}</strong>
          <span className="text-muted">emitida em {new Date(invoice.issued_at).toLocaleDateString("pt-BR")}</span>
          <a href={`/api/documents/invoice/${invoice.id}`} className="underline">
            Baixar PDF
          </a>
          <button type="button" disabled={pending} onClick={() => run(true)} className="border border-border px-3 py-1 disabled:opacity-40">
            Regerar PDF
          </button>
        </div>
      ) : canIssue ? (
        <button type="button" disabled={pending} onClick={() => run(false)} className="bg-foreground text-background text-xs px-4 py-2 disabled:opacity-40">
          Gerar invoice (PDF)
        </button>
      ) : (
        <p className="text-sm text-muted">A invoice pode ser gerada depois que o pedido estiver pago.</p>
      )}
      {message && <p className={`text-xs ${message.error ? "text-red-700" : ""}`}>{message.text}</p>}
    </section>
  );
}
