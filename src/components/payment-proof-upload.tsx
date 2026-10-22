"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { submitPaymentProof } from "@/app/[locale]/pedidos/[id]/proof-actions";
import { PROOF_ACCEPT, PROOF_MAX_BYTES } from "@/lib/payment-proof";

/** Buyer uploads the bank-transfer receipt (PDF/JPG/PNG, up to 8 MB). */
export function PaymentProofUpload({ orderId, hasPending }: { orderId: string; hasPending: boolean }) {
  const t = useTranslations("commercial");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const file = inputRef.current?.files?.[0];
    if (!file) return setError(t("proof.errNoFile"));
    if (file.size > PROOF_MAX_BYTES) return setError(t("proof.errTooBig"));
    const formData = new FormData();
    formData.set("proof", file);
    startTransition(async () => {
      const res = await submitPaymentProof(orderId, formData);
      if (res.ok) {
        setDone(true);
        setFileName(null);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      } else {
        setError(t(res.errorKey ?? "proof.errUpload"));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 border-t border-border pt-3">
      <h4 className="font-semibold uppercase tracking-wider">{t("proof.title")}</h4>
      <p className="text-muted">{t("proof.ourInstruction")}</p>
      {(hasPending || done) && (
        <p className="font-semibold text-foreground">{done ? t("proof.success") : t("proof.awaiting")}</p>
      )}
      <p className="text-muted">{t("proof.help")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          name="proof"
          accept={PROOF_ACCEPT}
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className="text-xs max-w-full"
          aria-label={t("proof.choose")}
        />
        <button type="submit" disabled={pending || !fileName} className="btn-primary px-4 py-2 text-[11px] uppercase tracking-[0.2em] font-semibold disabled:opacity-50">
          {pending ? t("proof.uploading") : hasPending || done ? t("proof.replace") : t("proof.submit")}
        </button>
      </div>
      {error && <p className="text-accent font-semibold" role="alert">{error}</p>}
    </form>
  );
}
