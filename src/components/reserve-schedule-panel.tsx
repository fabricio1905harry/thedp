"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { extendReserveWindow, setReserveSchedule } from "@/app/admin/envios-futuros/actions";

export const RESERVE_STAGE_LABELS: Record<string, string> = {
  reserved: "RESERVADO",
  balance_due: "SALDO A PAGAR",
  ready_to_ship: "PRONTO PARA ENVIO",
  overdue: "ATRASADO",
  expired: "ARMAZENAGEM EXPIRADA (180 dias após o envio)",
  completed: "CONCLUÍDO",
};

export function ReserveSchedulePanel({
  orderId,
  stage,
  desiredDate,
  dueDate,
  expiresAt,
  currency,
  deposit,
  balance,
}: {
  orderId: string;
  stage: string | null;
  desiredDate: string | null;
  dueDate: string | null;
  expiresAt: string | null;
  currency: string;
  deposit: number;
  balance: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [desired, setDesired] = useState(desiredDate ?? "");
  const [due, setDue] = useState(dueDate ?? "");
  const [days, setDays] = useState("30");
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  function run(fn: () => Promise<{ error?: string; info?: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      setMessage({ error: Boolean(result.error), text: result.error ?? result.info ?? "OK" });
      if (!result.error) router.refresh();
    });
  }
  const fmt = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ${currency}`;

  return (
    <section className="border border-border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-wider font-semibold">Reserve for Later Delivery</h2>
        {stage && <span className="text-[10px] font-semibold border border-foreground px-2 py-0.5">{RESERVE_STAGE_LABELS[stage] ?? stage}</span>}
      </div>
      <p className="text-xs text-muted">
        Depósito: <strong>{fmt(deposit)}</strong> · Saldo estimado (com frete/impostos): <strong>{fmt(balance)}</strong>
        {expiresAt && <> · Armazenagem (180 dias após a data de envio) até <strong>{new Date(expiresAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</strong></>}
      </p>
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label className="space-y-1">
          <span className="block text-muted">Entrega desejada</span>
          <input type="date" value={desired} onChange={(e) => setDesired(e.target.value)} className="border border-border px-2 py-1" />
        </label>
        <label className="space-y-1">
          <span className="block text-muted">Vencimento do saldo (vazio = entrega − 15 dias)</span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="border border-border px-2 py-1" />
        </label>
        <button type="button" disabled={pending} onClick={() => run(() => setReserveSchedule(orderId, desired || null, due || null))} className="bg-foreground text-background px-3 py-1.5 disabled:opacity-40">
          Salvar cronograma
        </button>
      </div>
      <p className="text-[11px] text-muted">Lembretes automáticos ao comprador 14, 8 e 7 dias antes do vencimento; após a data o pedido vira ATRASADO.</p>
      <div className="flex flex-wrap items-center gap-2 text-xs border-t border-border pt-3">
        <span className="text-muted">Estender armazenagem em</span>
        <input value={days} onChange={(e) => setDays(e.target.value)} className="w-16 border border-border px-2 py-1" inputMode="numeric" />
        <span className="text-muted">dias</span>
        <button type="button" disabled={pending} onClick={() => run(() => extendReserveWindow(orderId, Number(days)))} className="border border-border px-3 py-1.5 disabled:opacity-40">
          Estender
        </button>
      </div>
      {message && <p className={`text-xs ${message.error ? "text-red-700" : ""}`}>{message.text}</p>}
    </section>
  );
}
