"use client";

import { useState, useTransition } from "react";
import { getPaymentProofUrl } from "@/app/admin/pedidos/proof-actions";

/** Staff-only: opens the buyer's payment proof through a short-lived signed URL. */
export function PaymentProofLink({ orderId, paymentId, name }: { orderId: string; paymentId: string; name: string | null }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open() {
    setError(null);
    startTransition(async () => {
      const res = await getPaymentProofUrl(orderId, paymentId);
      if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
      else setError(res.error ?? "Falha ao abrir o comprovante.");
    });
  }

  return (
    <span className="block mt-1">
      <button type="button" onClick={open} disabled={pending} className="underline text-accent">
        {pending ? "Abrindo…" : "Ver comprovante"}
      </button>
      {name && <span className="text-muted"> ({name})</span>}
      {error && <span className="block text-red-600">{error}</span>}
    </span>
  );
}
