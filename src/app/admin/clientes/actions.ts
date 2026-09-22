"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";

/** AUTH-03/ADM-01: approve or reject a pending customer signup. */
export async function setCustomerStatus(
  customerId: string,
  status: "approved" | "rejected"
) {
  const staff = await getCurrentStaff();
  if (!staff) throw new Error("Não autorizado");

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ status })
    .eq("id", customerId);

  if (error) throw new Error(error.message);

  // AUTH-05 (email on approval) ships as a Supabase Edge Function trigger
  // once the project exists — not wired here yet.
  revalidatePath("/admin/clientes");
}
