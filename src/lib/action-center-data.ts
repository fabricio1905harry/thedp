import { createClient } from "@/lib/supabase/server";
import { sortActionItems, type ActionItem, type QueueSort } from "@/lib/action-center";

export interface ActionCard {
  code: string;
  label: string;
  priorityGroup: number;
  count: number;
  href: string;
  manualResolve: boolean;
}

/** Types whose card counts units (e.g. images) rather than queue items. */
const COUNT_AFFECTED = new Set(["images_to_review", "colors_to_review", "brand_application"]);

export async function loadActionCenter(sort: QueueSort = "system", type?: string) {
  const supabase = await createClient();
  const [{ data: types }, { data: items }] = await Promise.all([
    supabase.from("action_types").select("code, label, priority_group, card_href, manual_resolve, sort").eq("active", true).order("sort"),
    supabase
      .from("action_items")
      .select(
        "id, action_type, priority_group, severity, title, reference_type, reference_id, reference_label, subject_label, value_amount, value_currency, value_brl, affected_count, href, pinned, pinned_at, created_at"
      )
      .eq("status", "open")
      .limit(5000),
  ]);

  const open = (items ?? []) as ActionItem[];
  const cards: ActionCard[] = (types ?? []).map((t) => {
    const ofType = open.filter((i) => i.action_type === t.code);
    return {
      code: t.code,
      label: t.label,
      priorityGroup: t.priority_group,
      count: COUNT_AFFECTED.has(t.code) ? ofType.reduce((s, i) => s + (i.affected_count ?? 1), 0) : ofType.length,
      href: t.card_href ?? `/admin/acoes?type=${t.code}`,
      manualResolve: t.manual_resolve,
    };
  });

  const manualTypes = new Set((types ?? []).filter((t) => t.manual_resolve).map((t) => t.code));
  const labels = new Map((types ?? []).map((t) => [t.code, t.label]));
  const queue = sortActionItems(type ? open.filter((i) => i.action_type === type) : open, sort);
  return { cards, queue, manualTypes, labels, now: Date.now() };
}
