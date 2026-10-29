"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { placementAction, type PlacementAction } from "@/app/admin/placements/actions";

/** Renew / Extend / End a paid placement (the item itself always stays on the site). */
export function PlacementActions({ table, id }: { table: string; id: string }) {
  const router = useRouter();
  const [days, setDays] = useState("30");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(action: PlacementAction) {
    if (action === "end" && !confirm("Encerrar o destaque pago? O item continua no site, só perde o selo de parceiro e o destaque.")) return;
    setMsg(null);
    start(async () => {
      const res = await placementAction(table, id, action, Number(days));
      setMsg(res.error ?? null);
      router.refresh();
    });
  }

  const btn = "border border-border px-2 py-1 text-[11px] disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input type="number" min={1} max={730} value={days} onChange={(e) => setDays(e.target.value)} aria-label="Dias" className="w-14 border border-border px-1.5 py-1 text-[11px]" />
      <span className="text-[11px] text-muted">dias</span>
      <button type="button" disabled={pending} onClick={() => run("renew")} className={btn}>Renovar</button>
      <button type="button" disabled={pending} onClick={() => run("extend")} className={btn}>Estender</button>
      <button type="button" disabled={pending} onClick={() => run("end")} className={btn}>Encerrar</button>
      {msg && <span className="text-[11px] text-red-700">{msg}</span>}
    </div>
  );
}
