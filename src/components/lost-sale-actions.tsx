"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLostSaleStatus } from "@/app/admin/vendas-perdidas/actions";

export function LostSaleActions({ id, status, quantity }: { id: string; status: string; quantity: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [revenue, setRevenue] = useState("");
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  if (status === "recovered" || status === "not_recovered") return null;
  return (
    <span className="space-x-2 whitespace-nowrap">
      {status !== "contacted" && (
        <button type="button" disabled={pending} className="underline" onClick={() => run(() => setLostSaleStatus([id], "contacted"))}>
          Contacted
        </button>
      )}
      <input value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="revenue" className="w-16 border border-border px-1" />
      <button
        type="button"
        disabled={pending}
        className="underline"
        onClick={() => run(() => setLostSaleStatus([id], "recovered", { units: quantity, revenue: Number(revenue || 0) }))}
      >
        Recovered
      </button>
      <button type="button" disabled={pending} className="underline" onClick={() => run(() => setLostSaleStatus([id], "not_recovered"))}>
        Not recovered
      </button>
    </span>
  );
}
