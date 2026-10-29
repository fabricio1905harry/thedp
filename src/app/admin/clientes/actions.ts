"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";
import { flushEmailOutbox } from "@/lib/email";

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
    throw new Error("Escreva quais informações são necessárias.");
  }

  const supabase = await createClient();
  const { data: customer, error: readError } = await supabase
    .from("customers")
    .select("email, locale, name, company_name")
    .eq("id", customerId)
    .single();
  if (readError || !customer) throw new Error(readError?.message ?? "Cliente não encontrado");

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

  let sendRejection = false;
  if (status === "rejected") {
    // the refusal e-mail only goes out when the TDP approved a text for it (Admin → Notificações)
    const { data: tpl } = await supabase
      .from("notification_templates")
      .select("id")
      .eq("event", "wholesale_account_rejected")
      .eq("channel", "email")
      .eq("approved", true)
      .limit(1);
    sendRejection = (tpl ?? []).length > 0;
    if (sendRejection) {
      await supabase.from("email_outbox").insert({
        to_email: customer.email,
        template: "wholesale_account_rejected",
        locale: customer.locale ?? "en",
        payload: { buyer_name: customer.name, store_name: customer.company_name, note: note?.trim() || null },
      });
    }
  }

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

  // Send right away; anything that fails stays in email_outbox for the hourly retry.
  let emailNote: string | undefined;
  if (status === "approved" || status === "more_info" || sendRejection) {
    const flush = await flushEmailOutbox(10).catch((e) => ({ configured: true, sent: 0, failed: 1, firstError: String(e) }));
    if (!flush.configured) emailNote = "E-mail NÃO enviado: configure RESEND_API_KEY e EMAIL_FROM (ele fica na fila e é enviado assim que configurado).";
    else if (flush.failed > 0) emailNote = `Falha no e-mail (nova tentativa a cada hora): ${flush.firstError ?? "erro desconhecido"}`;
  }
  return { emailNote };
}
