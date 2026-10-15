"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";

async function requireStaff() {
  const staff = await getCurrentStaff();
  if (!staff) throw new Error("Not authorized");
  return staff;
}

/** PIN / PRIORITIZE — puts an item at the top of System Priority. */
export async function setActionPinned(itemId: string, pinned: boolean) {
  const staff = await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase
    .from("action_items")
    .update({ pinned, pinned_at: pinned ? new Date().toISOString() : null, pinned_by: pinned ? staff.id : null })
    .eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/acoes");
}

/**
 * Mark as Resolved — only for types without an objective system action
 * that closes them automatically (action_types.manual_resolve).
 */
export async function markActionResolved(itemId: string) {
  const staff = await requireStaff();
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("action_items")
    .select("action_type, action_types ( manual_resolve )")
    .eq("id", itemId)
    .single();
  const manual = (item?.action_types as unknown as { manual_resolve: boolean } | null)?.manual_resolve;
  if (!manual) {
    throw new Error("This item closes automatically when the underlying action is done.");
  }
  const { error } = await supabase
    .from("action_items")
    .update({ status: "resolved", resolution: "manual", resolved_at: new Date().toISOString(), resolved_by: staff.id })
    .eq("id", itemId)
    .eq("status", "open");
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/acoes");
}
