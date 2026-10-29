"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { PROOF_BUCKET, PROOF_MAX_BYTES, detectProofType } from "@/lib/payment-proof";

/** Signed link (5 min) to the proof of a payment. Staff only; returns { error } on failure. */
export async function getPaymentProofUrl(orderId: string, paymentId: string): Promise<{ url?: string; error?: string }> {
  try {
    const staff = await getCurrentStaff();
    if (!staff) return { error: "Não autorizado" };

    const supabase = await createClient();
    const { data: payment } = await supabase
      .from("payments")
      .select("proof_path")
      .eq("id", paymentId)
      .eq("order_id", orderId)
      .maybeSingle();
    if (!payment?.proof_path) return { error: "Este pagamento não tem comprovante." };

    const { data, error } = await createServiceRoleClient()
      .storage.from(PROOF_BUCKET)
      .createSignedUrl(payment.proof_path, 300);
    if (error || !data?.signedUrl) return { error: error?.message ?? "Não foi possível gerar o link do comprovante." };
    return { url: data.signedUrl };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao abrir o comprovante." };
  }
}

/**
 * The TDP attaches a proof received outside the site (WhatsApp / e-mail) to a payment of the order.
 * Same private bucket and rules as the buyer's upload; the payment stays PENDING VERIFICATION —
 * nothing is confirmed automatically.
 */
export async function attachStaffPaymentProof(orderId: string, paymentId: string, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const staff = await getCurrentStaff();
    if (!staff) return { error: "Não autorizado" };
    const file = formData.get("proof");
    if (!(file instanceof File) || file.size === 0) return { error: "Escolha o arquivo do comprovante." };
    if (file.size > PROOF_MAX_BYTES) return { error: "Arquivo muito grande (máx. 8 MB)." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = detectProofType(bytes);
    if (!kind) return { error: "Use PDF, JPG ou PNG." };

    const supabase = createServiceRoleClient();
    const { data: payment } = await supabase
      .from("payments")
      .select("id, proof_path")
      .eq("id", paymentId)
      .eq("order_id", orderId)
      .maybeSingle();
    if (!payment) return { error: "Pagamento não encontrado." };

    const path = `staff/${orderId}/${randomUUID()}.${kind.ext}`;
    const { error: uploadError } = await supabase.storage.from(PROOF_BUCKET).upload(path, bytes, { contentType: kind.mime, upsert: false });
    if (uploadError) return { error: uploadError.message };

    const { data: updated, error } = await supabase
      .from("payments")
      .update({ proof_path: path, proof_name: file.name.slice(0, 200), proof_uploaded_at: new Date().toISOString() })
      .eq("id", paymentId)
      .select("id");
    if (error || !updated?.length) {
      await supabase.storage.from(PROOF_BUCKET).remove([path]);
      return { error: error?.message ?? "Não foi possível anexar o comprovante." };
    }
    if (payment.proof_path) await supabase.storage.from(PROOF_BUCKET).remove([payment.proof_path]);
    await supabase.from("order_events").insert({
      order_id: orderId,
      actor_id: staff.id,
      event_type: "payment_proof_attached_by_staff",
      summary: `Comprovante anexado pela TDP (${file.name.slice(0, 120)}) — recebido fora do site`,
    });
    revalidatePath(`/admin/pedidos/${orderId}`);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao anexar o comprovante." };
  }
}

/** Language of the e-mails / messages about this order ("" = the buyer's account language). */
export async function setOrderCommunicationLocale(orderId: string, locale: string): Promise<{ ok?: boolean; error?: string }> {
  try {
    const staff = await getCurrentStaff();
    if (!staff) return { error: "Não autorizado" };
    if (locale !== "" && !["en", "es", "pt"].includes(locale)) return { error: "Idioma inválido." };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("orders")
      .update({ communication_locale: locale || null })
      .eq("id", orderId)
      .select("id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "Pedido não encontrado." };
    await supabase.from("order_events").insert({
      order_id: orderId,
      actor_id: staff.id,
      event_type: "communication_locale",
      summary: `Idioma da comunicação do pedido → ${locale ? locale.toUpperCase() : "idioma da conta do comprador"}`,
    });
    revalidatePath(`/admin/pedidos/${orderId}`);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao salvar." };
  }
}
