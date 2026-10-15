"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markActionResolved, setActionPinned } from "@/app/admin/acoes/actions";
import { displayLevel, waitingTime, type ActionItem } from "@/lib/action-center";

const LEVEL_CLASS = {
  critical: "bg-red-600 text-white",
  high: "bg-amber-200 text-amber-950",
  normal: "bg-zinc-200 text-zinc-800",
};

/** The single ACTION REQUIRED queue. */
export function ActionQueue({
  items,
  labels,
  manualTypes,
  now,
}: {
  now: number;
  items: ActionItem[];
  labels: Record<string, string>;
  manualTypes: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await fn();
      } finally {
        router.refresh();
      }
    });
  }

  if (items.length === 0) return <p className="text-xs text-muted">Nothing waiting for action. 🎉</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[720px]">
        <thead>
          <tr className="text-left text-muted uppercase border-b border-border">
            <th className="py-2 pr-2">Priority</th>
            <th className="py-2 pr-2">Action</th>
            <th className="py-2 pr-2">Reference</th>
            <th className="py-2 pr-2">Customer / Product</th>
            <th className="py-2 pr-2 text-right">Value</th>
            <th className="py-2 pr-2">Waiting</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const level = displayLevel(item);
            return (
              <tr key={item.id} className="border-b border-border align-top">
                <td className="py-2 pr-2">
                  <span className={`px-1.5 py-0.5 font-semibold uppercase text-[10px] ${LEVEL_CLASS[level]}`}>{level}</span>
                  {item.pinned && <span className="ml-1" title="Pinned">📌</span>}
                </td>
                <td className="py-2 pr-2">
                  <Link href={item.href ?? "#"} className="font-medium underline hover:text-accent">
                    {labels[item.action_type] ?? item.action_type}
                  </Link>
                  <span className="block text-muted">{item.title}</span>
                </td>
                <td className="py-2 pr-2">{item.reference_label ?? "—"}</td>
                <td className="py-2 pr-2">{item.subject_label ?? "—"}</td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">
                  {item.value_amount !== null && item.value_amount !== undefined
                    ? `${Number(item.value_amount).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} ${item.value_currency ?? ""}`
                    : "—"}
                </td>
                <td className="py-2 pr-2 whitespace-nowrap">{waitingTime(item.created_at, now)}</td>
                <td className="py-2 whitespace-nowrap space-x-2">
                  <button type="button" disabled={pending} onClick={() => run(() => setActionPinned(item.id, !item.pinned))} className="underline">
                    {item.pinned ? "Unpin" : "Pin"}
                  </button>
                  {manualTypes.includes(item.action_type) && (
                    <button type="button" disabled={pending} onClick={() => run(() => markActionResolved(item.id))} className="underline">
                      Mark as resolved
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
