"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";
import { flushEmailOutbox, queueEmail } from "@/lib/email";

export async function setContactStatus(id: string, status: "new" | "in_progress" | "resolved", note?: string) {
  const staff = await getCurrentStaff();
  if (!staff) throw new Error("Não autorizado");
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

export interface ReplyResult {
  error?: string;
  emailNote?: string;
}

/**
 * Admin replies to the sender: queues the `contact_reply` e-mail (sent right
 * away when the provider is configured; otherwise stays queued) and records
 * the reply on the message. Returns { error } instead of throwing.
 */
export async function replyToContact(id: string, reply: string): Promise<ReplyResult> {
  try {
    const staff = await getCurrentStaff();
    if (!staff) return { error: "Não autorizado." };
    const text = reply.trim();
    if (text.length < 2) return { error: "Escreva a resposta antes de enviar." };

    const supabase = await createClient();
    const { data: row } = await supabase
      .from("contact_messages")
      .select("id, name, email, subject, message, locale, order_number, status")
      .eq("id", id)
      .maybeSingle();
    if (!row) return { error: "Mensagem não encontrada." };

    const returnLabel = row.locale === "pt" ? "Devolução / pós-venda" : row.locale === "es" ? "Devolución / posventa" : "Return / after-sale";
    const queued = await queueEmail(row.email, "contact_reply", row.locale, {
      buyer_name: row.name,
      subject: row.subject === "return" ? returnLabel : row.subject,
      reply: text.slice(0, 5000),
      original: row.message,
      order_number: row.order_number ?? "",
    });
    if (!queued) return { error: "Não foi possível colocar o e-mail na fila." };

    const { data: updated, error } = await supabase
      .from("contact_messages")
      .update({
        replied_at: new Date().toISOString(),
        reply_text: text.slice(0, 5000),
        replied_by: staff.id,
        handled_by: staff.id,
        status: row.status === "new" ? "in_progress" : row.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id");
    if (error || !updated || updated.length === 0) return { error: "E-mail colocado na fila, mas não foi possível registrar a resposta." };

    let emailNote: string | undefined;
    const flush = await flushEmailOutbox(10).catch((e) => ({ configured: true, sent: 0, failed: 1, firstError: String(e) }));
    if (!flush.configured) emailNote = "E-mail NÃO enviado ainda: configure RESEND_API_KEY e EMAIL_FROM (ele fica na fila e sai assim que configurado).";
    else if (flush.failed > 0) emailNote = `Falha no envio (nova tentativa a cada hora): ${flush.firstError ?? "erro desconhecido"}`;

    revalidatePath("/admin/contatos");
    revalidatePath("/admin");
    return { emailNote };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao responder." };
  }
}
