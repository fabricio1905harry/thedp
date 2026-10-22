"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { cancelOrderRequest, requestOrderReturn, type BuyerActionResult } from "@/app/[locale]/pedidos/[id]/actions";

/** Buyer cancels an Order Request (only offered while it is cancelable). Two-step to avoid accidents. */
export function CancelOrderButton({ orderId, compact = false }: { orderId: string; compact?: boolean }) {
  const t = useTranslations("orderActions");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function confirmCancel() {
    setError(null);
    startTransition(async () => {
      const res: BuyerActionResult = await cancelOrderRequest(orderId, reason);
      if (res.error) {
        setError(t(`errors.${res.error}`));
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={compact ? "text-[11px] underline text-muted hover:text-accent" : "border border-border px-5 py-2.5 text-[11px] uppercase tracking-[0.2em] font-semibold hover:border-foreground"}
      >
        {t("cancelCta")}
      </button>
    );
  }

  return (
    <div className="border border-border p-4 space-y-3 text-sm max-w-md bg-background">
      <p className="font-medium">{t("cancelConfirmTitle")}</p>
      <p className="text-xs text-muted leading-relaxed">{t("cancelConfirmText")}</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder={t("cancelReasonPlaceholder")}
        className="w-full border border-border px-3 py-2 text-xs bg-background"
      />
      {error && <p className="text-xs text-accent font-medium">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={confirmCancel} className="bg-foreground text-background px-5 py-2.5 text-[11px] uppercase tracking-[0.2em] font-semibold disabled:opacity-50">
          {pending ? t("canceling") : t("cancelConfirm")}
        </button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)} className="border border-border px-5 py-2.5 text-[11px] uppercase tracking-[0.2em] font-semibold">
          {t("keepOrder")}
        </button>
      </div>
    </div>
  );
}

/** Simple return / after-sale form: creates a contact message referencing the order. */
export function ReturnRequestForm({ orderId }: { orderId: string }) {
  const t = useTranslations("orderActions");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return <p className="text-sm border border-border bg-surface p-4">{t("returnSent")}</p>;
  }

  return (
    <form
      id="return"
      className="border border-border p-5 space-y-3 max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await requestOrderReturn(orderId, text, locale);
          if (res.error) setError(t(`errors.${res.error}`));
          else setDone(true);
        });
      }}
    >
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">{t("returnTitle")}</h3>
      <p className="text-xs text-muted leading-relaxed">{t("returnIntro")}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        required
        minLength={5}
        rows={4}
        placeholder={t("returnPlaceholder")}
        className="w-full border border-border px-3 py-2 text-sm bg-background"
      />
      {error && <p className="text-xs text-accent font-medium">{error}</p>}
      <button type="submit" disabled={pending} className="bg-foreground text-background px-6 py-3 text-[11px] uppercase tracking-[0.2em] font-semibold disabled:opacity-50">
        {pending ? t("sending") : t("returnSubmit")}
      </button>
    </form>
  );
}
