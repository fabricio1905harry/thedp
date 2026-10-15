"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";

export async function setContactStatus(id: string, status: "new" | "in_progress" | "resolved", note?: string) {
  const staff = await getCurrentStaff();
  if (!staff) throw new Error("Not authorized");
  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_messages")
    .update({
      status,
      handled_by: staff.id,
      updated_at: new Date().toISOString(),
      ...(note !== undefined ? { internal_note: note.slice(0, 2000) || null } : {}),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/contatos");
  revalidatePath("/admin");
}
