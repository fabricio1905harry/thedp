import Link from "next/link";
import type { ActionCard } from "@/lib/action-center-data";
import { PRIORITY_GROUP_LABELS } from "@/lib/action-center";

/** One clickable card per action type (count > 0 first, grouped by priority). */
export function ActionCards({ cards, showEmpty = false }: { cards: ActionCard[]; showEmpty?: boolean }) {
  const visible = cards.filter((c) => showEmpty || c.count > 0);
  if (visible.length === 0) return <p className="text-xs text-muted">No pending actions.</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {visible.map((c) => (
        <Link
          key={c.code}
          href={c.href}
          title={PRIORITY_GROUP_LABELS[c.priorityGroup]}
          className={`border p-3 hover:border-foreground transition-colors ${c.count > 0 ? "border-border" : "border-border opacity-50"}`}
        >
          <p className="text-xl font-semibold">{c.count}</p>
          <p className="text-[11px] text-muted leading-tight mt-1">{c.label}</p>
        </Link>
      ))}
    </div>
  );
}
