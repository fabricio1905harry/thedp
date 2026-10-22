"use client";

import { useEffect } from "react";
import { recordPaymentCanceled } from "@/app/[locale]/pedidos/[id]/proof-actions";

/** Logs (once, server-side deduped) that the buyer came back from Stripe without paying. */
export function PaymentCanceledLogger({ orderId }: { orderId: string }) {
  useEffect(() => {
    void recordPaymentCanceled(orderId);
  }, [orderId]);
  return null;
}
