"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";

/**
 * Wholesale account review: APPROVE (queues the "account approved" e-mail),
 * REJECT, or REQUEST MORE INFORMATION (note for the applicant, queues an
 * e-mail). E-mails are queued in email_outbox until a sender is connected.
 */
export async function setCustomerStatus(
  customerId: string,
  status: "approved" | "rejected" | "more_info",
  note?: string
) {
  const staff = await getCurrentStaff();
  if (!staff) throw new Error("Não autorizado");
  if (status === "more_info" && !note?.trim()) {
    throw new Error("Write what information is needed.");
  }

  const supabase = await createClient();
  const { data: customer, error: readError } = await supabase
    .from("customers")
    .select("email, locale, name, company_name")
    .eq("id", customerId)
    .single();
  if (readError || !customer) throw new Error(readError?.message ?? "Customer not found");

  const { error } = await supabase
    .from("customers")
    .update({
      status,
      review_note: note?.trim() || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: staff.id,
    })
    .eq("id", customerId);
  if (error) throw new Error(error.message);

  if (status === "approved" || status === "more_info") {
    await supabase.from("email_outbox").insert({
      to_email: customer.email,
      template: status === "approved" ? "wholesale_account_approved" : "wholesale_more_info",
      locale: customer.locale ?? "en",
      payload: { buyer_name: customer.name, store_name: customer.company_name, note: note?.trim() || null },
    });
  }

  revalidatePath("/admin/clientes");
  revalidatePath("/admin");
}
