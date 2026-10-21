/**
 * Action Center ordering. Items come from the action_items table (fed by
 * DB triggers, migration 0027); this decides the order of the single
 * ACTION REQUIRED queue.
 *
 * System Priority:
 *   1. pinned (manual PRIORITIZE) — most recently pinned first
 *   2. CRITICAL severity, whatever the group
 *   3. priority group 1→6 (money ready → sale in progress → recoverable
 *      revenue → paid-order commitment → risk → catalog curation)
 *   4. within the group: a score from value (BRL), affected buyers/orders
 *      and waiting time; ties → oldest first
 */

export type Severity = "critical" | "high" | "normal";
export type QueueSort = "system" | "value" | "oldest" | "newest";

export interface ActionItem {
  id: string;
  action_type: string;
  priority_group: number;
  severity: Severity;
  title: string;
  reference_type: string | null;
  reference_id: string | null;
  reference_label: string | null;
  subject_label: string | null;
  value_amount: number | null;
  value_currency: string | null;
  value_brl: number | null;
  affected_count: number;
  href: string | null;
  pinned: boolean;
  pinned_at: string | null;
  created_at: string;
}

export const PRIORITY_GROUP_LABELS: Record<number, string> = {
  1: "Dinheiro pronto para entrar",
  2: "Venda em andamento",
  3: "Receita recuperável",
  4: "Pedido pago / compromisso de envio",
  5: "Risco financeiro / comercial",
  6: "Curadoria de catálogo",
};

const HOUR = 60 * 60 * 1000;

/** Within-group score. Value and waiting time are log-scaled so neither dominates. */
export function withinGroupScore(item: ActionItem, now = Date.now()): number {
  const valueBrl = Math.max(0, Number(item.value_brl ?? 0));
  const waitingHours = Math.max(0, (now - new Date(item.created_at).getTime()) / HOUR);
  const affected = Math.max(1, item.affected_count ?? 1);
  return (
    Math.log10(1 + valueBrl) * 10 +
    Math.log2(affected) * 6 +
    Math.log2(1 + waitingHours) * 4 +
    (item.severity === "high" ? 8 : 0)
  );
}

/** Visual level shown in the queue (no raw score). */
export function displayLevel(item: ActionItem): Severity {
  if (item.severity === "critical") return "critical";
  if (item.severity === "high" || item.priority_group <= 2) return "high";
  return "normal";
}

export function sortActionItems(items: ActionItem[], sort: QueueSort = "system", now = Date.now()): ActionItem[] {
  const byAge = (a: ActionItem, b: ActionItem) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  const copy = [...items];

  if (sort === "oldest") return copy.sort(byAge);
  if (sort === "newest") return copy.sort((a, b) => byAge(b, a));
  if (sort === "value") {
    return copy.sort((a, b) => Number(b.value_brl ?? 0) - Number(a.value_brl ?? 0) || byAge(a, b));
  }

  return copy.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.pinned && b.pinned) {
      return new Date(b.pinned_at ?? 0).getTime() - new Date(a.pinned_at ?? 0).getTime();
    }
    const aCrit = a.severity === "critical";
    const bCrit = b.severity === "critical";
    if (aCrit !== bCrit) return aCrit ? -1 : 1;
    if (a.priority_group !== b.priority_group) return a.priority_group - b.priority_group;
    const diff = withinGroupScore(b, now) - withinGroupScore(a, now);
    if (Math.abs(diff) > 1e-9) return diff;
    return byAge(a, b);
  });
}

export function waitingTime(createdAt: string, now = Date.now()): string {
  const hours = (now - new Date(createdAt).getTime()) / HOUR;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} d`;
}
