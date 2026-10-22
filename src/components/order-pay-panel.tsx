"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { startStripeCheckout } from "@/app/[locale]/pedidos/[id]/actions";
import { formatCurrency } from "@/lib/currency";
import type { Currency } from "@/lib/types";
import { WhatsAppInlineLink } from "@/components/whatsapp-button";
import { PaymentProofUpload } from "@/components/payment-proof-upload";

export interface PayPanelProps {
  orderId: string;
  locale: string;
  currency: Currency;
  kind: "full" | "reserve_deposit" | "balance";
  total: number;
  merchandise: number;
  charges: number;
  stripeEnabled: boolean;
  bankEnabled: boolean;
  bankInstructions: string;
  /** buyer came back from a failed / canceled card payment */
  paymentFailed?: boolean;
  /** a bank transfer proof is already waiting for verification */
  proofPending?: boolean;
}

/** Payment options for a Confirmed Order, limited to what is enabled for it. */
export function OrderPayPanel(props: PayPanelProps) {
  const t = useTranslations("order");
  const tc = useTranslations("commercial");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function payByCard() {
    setError(null);
    startTransition(async () => {
      const res = await startStripeCheckout(props.orderId, props.locale);
      if (res.url) {
        window.location.href = res.url;
      } else {
        setError(res.error ?? t("payError"));
      }
    });
  }

  const kindLabel =
    props.kind === "reserve_deposit" ? t("payKindReserve") : props.kind === "balance" ? t("payKindBalance") : t("payKindFull");

  return (
    <div className="border border-border p-5 space-y-4 bg-white">
      {props.paymentFailed && (
        <div className="border border-accent p-4 space-y-2" role="alert">
          <h3 className="text-xs uppercase tracking-[0.2em] font-semibold text-accent">{tc("payFailed.title")}</h3>
          <p className="text-sm text-muted">{tc("payFailed.body")}</p>
          {props.stripeEnabled && (
            <button type="button" onClick={payByCard} disabled={pending} className="btn-primary px-5 py-2.5 text-[11px] uppercase tracking-[0.2em] font-semibold">
              {pending ? t("payRedirecting") : tc("payFailed.retry")}
            </button>
          )}
        </div>
      )}
      <div>
        <h3 className="text-xs uppercase tracking-[0.2em] font-semibold text-accent">{t("payTitle")}</h3>
        <p className="text-sm mt-2">
          {kindLabel}: <strong>{formatCurrency(props.total, props.currency)}</strong>
        </p>
        {props.kind !== "reserve_deposit" && props.charges > 0 && (
          <p className="text-[11px] text-muted">
            {t("payBreakdown", {
              merchandise: formatCurrency(props.merchandise, props.currency),
              charges: formatCurrency(props.charges, props.currency),
            })}
          </p>
        )}
      </div>

      {props.stripeEnabled && !props.paymentFailed && (
        <button type="button" onClick={payByCard} disabled={pending} className="btn-primary w-full sm:w-auto px-6 py-3 text-xs uppercase tracking-[0.2em] font-semibold">
          {pending ? t("payRedirecting") : t("payByCard")}
        </button>
      )}

      {props.bankEnabled && (
        <div className="text-xs space-y-2 border-t border-border pt-3">
          <h4 className="font-semibold uppercase tracking-wider">{t("payByTransfer")}</h4>
          {props.bankInstructions ? (
            <pre className="whitespace-pre-wrap font-sans text-muted leading-relaxed">{props.bankInstructions}</pre>
          ) : (
            <p className="text-muted">{t("payTransferContact")}</p>
          )}
          <p className="text-muted">{t("payTransferNotice")}</p>
          <PaymentProofUpload orderId={props.orderId} hasPending={Boolean(props.proofPending)} />
          <WhatsAppInlineLink source="order:send_transfer_proof" className="underline text-accent">
            {t("paySendProof")}
          </WhatsAppInlineLink>
        </div>
      )}

      {error && <p className="text-xs text-accent font-semibold">{error}</p>}
    </div>
  );
}
