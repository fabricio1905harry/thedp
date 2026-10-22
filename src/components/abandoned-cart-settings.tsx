"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAbandonedCartSettings } from "@/app/admin/carrinhos/actions";

export function AbandonedCartSettings({ enabled, hours1, hours2 }: { enabled: boolean; hours1: number; hours2: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [on, setOn] = useState(enabled);
  const [h1, setH1] = useState(String(hours1));
  const [h2, setH2] = useState(String(hours2));
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveAbandonedCartSettings({ enabled: on, hours1: Number(h1), hours2: Number(h2) });
      setMessage({ error: Boolean(result.error), text: result.error ?? result.info ?? "OK" });
      if (!result.error) router.refresh();
    });
  }

  return (
    <section className="border border-border p-4 space-y-3 text-sm">
      <h2 className="text-xs uppercase tracking-wider text-muted">Sequência automática</h2>
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
          Sequência ligada
        </label>
        <label className="flex items-center gap-2">
          E-mail 1 após
          <input value={h1} onChange={(e) => setH1(e.target.value)} className="w-16 border border-border px-2 py-1" inputMode="decimal" /> h
        </label>
        <label className="flex items-center gap-2">
          E-mail 2 após
          <input value={h2} onChange={(e) => setH2(e.target.value)} className="w-16 border border-border px-2 py-1" inputMode="decimal" /> h
        </label>
        <button type="button" disabled={pending} onClick={save} className="bg-foreground text-background px-3 py-1.5 disabled:opacity-40">
          Salvar
        </button>
      </div>
      <p className="text-[11px] text-muted">
        Contado a partir da última atividade no carrinho. Para quando o Order Request é enviado ou o carrinho é esvaziado. Textos em Notificações (abandoned_cart_1 / abandoned_cart_2).
      </p>
      {message && <p className={`text-xs ${message.error ? "text-red-700" : ""}`}>{message.text}</p>}
    </section>
  );
}
