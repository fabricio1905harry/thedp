import Link from "next/link";
import { loadActionCenter } from "@/lib/action-center-data";
import { ActionCards } from "@/components/action-cards";
import { ActionQueue } from "@/components/action-queue";
import type { QueueSort } from "@/lib/action-center";

const SORTS: { key: QueueSort; label: string }[] = [
  { key: "system", label: "System Priority" },
  { key: "value", label: "Highest Value" },
  { key: "oldest", label: "Oldest" },
  { key: "newest", label: "Newest" },
];

export default async function AdminActionCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const sort = (SORTS.some((s) => s.key === sp.sort) ? sp.sort : "system") as QueueSort;
  const { cards, queue, manualTypes, labels, now } = await loadActionCenter(sort, sp.type);
  const qs = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { sort, type: sp.type, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    return `/admin/acoes?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl mb-1">Action Center</h1>
        <p className="text-sm text-muted max-w-2xl">
          Everything that depends on a TDP action. Items close automatically when the action that solves them is
          done; history is kept. “Mark as resolved” only exists for items with no objective system action.
        </p>
      </div>

      <ActionCards cards={cards} showEmpty />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">Sort:</span>
        {SORTS.map((s) => (
          <Link key={s.key} href={qs({ sort: s.key })} className={`border px-2 py-1 ${s.key === sort ? "border-foreground font-semibold" : "border-border"}`}>
            {s.label}
          </Link>
        ))}
        {sp.type && (
          <Link href={qs({ type: undefined })} className="ml-2 underline">
            Filter: {labels.get(sp.type) ?? sp.type} ✕
          </Link>
        )}
      </div>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide mb-2">Action Required — {queue.length}</h2>
        <ActionQueue items={queue} labels={Object.fromEntries(labels)} manualTypes={[...manualTypes]} now={now} />
      </section>
    </div>
  );
}
