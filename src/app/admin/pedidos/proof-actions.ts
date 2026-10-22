"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";
import { PROOF_BUCKET } from "@/lib/payment-proof";

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
