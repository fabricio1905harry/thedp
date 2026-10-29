"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { attachStaffPaymentProof, setOrderCommunicationLocale } from "@/app/admin/pedidos/proof-actions";

/** TDP attaches a proof received by WhatsApp / e-mail to a payment (stays pending verification). */
export function StaffProofUpload({ orderId, paymentId, hasProof }: { orderId: string; paymentId: string; hasProof: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    const file = ref.current?.files?.[0];
    if (!file) {
      setMsg("Escolha o arquivo.");
      return;
    }
    const fd = new FormData();
    fd.set("proof", file);
    setMsg(null);
    start(async () => {
      const res = await attachStaffPaymentProof(orderId, paymentId, fd);
      setMsg(res.error ?? "Anexado.");
      if (ref.current) ref.current.value = "";
      router.refresh();
    });
  }

  return (
    <span className="block mt-1 text-[11px]">
      <span className="text-muted">{hasProof ? "Trocar comprovante (recebido por WhatsApp / e-mail):" : "Anexar comprovante recebido por WhatsApp / e-mail:"}</span>{" "}
      <input ref={ref} type="file" accept="application/pdf,image/jpeg,image/png" className="max-w-[12rem]" />
      <button type="button" disabled={pending} onClick={send} className="border border-border px-2 py-0.5 ml-1 disabled:opacity-50">
        {pending ? "Enviando…" : "Anexar"}
      </button>
      {msg && <span className="ml-2">{msg}</span>}
    </span>
  );
}

/** Language of the communication about this order (e-mails / messages). */
export function OrderLanguageSelect({ orderId, value, accountLocale }: { orderId: string; value: string | null; accountLocale: string | null }) {
  const router = useRouter();
  const [current, setCurrent] = useState(value ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function change(next: string) {
    setCurrent(next);
    setMsg(null);
    start(async () => {
      const res = await setOrderCommunicationLocale(orderId, next);
      setMsg(res.error ?? "Salvo.");
      router.refresh();
    });
  }

  return (
    <label className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-medium">Idioma da comunicação deste pedido</span>
      <select value={current} disabled={pending} onChange={(e) => change(e.target.value)} className="border border-border px-2 py-1">
        <option value="">Idioma da conta do comprador ({(accountLocale ?? "en").toUpperCase()})</option>
        <option value="en">English</option>
        <option value="es">Español</option>
        <option value="pt">Português</option>
      </select>
      {msg && <span className="text-muted">{msg}</span>}
    </label>
  );
}
