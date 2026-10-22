"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentCustomer } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { computeAmountDue, ORDER_CHARGE_COLUMNS } from "@/lib/payments";
import { PROOF_BUCKET, PROOF_MAX_BYTES, detectProofType } from "@/lib/payment-proof";

export interface ProofResult {
  ok?: boolean;
  /** i18n key inside the `commercial` namespace (buyer UI translates it). */
  errorKey?: string;
}

/**
 * Buyer uploads the proof of a Bank Transfer. The file goes to the private
 * bucket (service role, after validating that the order belongs to the buyer
 * and is open for payment) and a payment PENDING VERIFICATION is created (or
 * the open one gets the new file). Confirmation is always manual (Admin).
 */
export async function submitPaymentProof(orderId: string, formData: FormData): Promise<ProofResult> {
  try {
    const customer = await getCurrentCustomer();
    if (!customer) return { errorKey: "proof.errSignIn" };

    const file = formData.get("proof");
    if (!(file instanceof File) || file.size === 0) return { errorKey: "proof.errNoFile" };
    if (file.size > PROOF_MAX_BYTES) return { errorKey: "proof.errTooBig" };

    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = detectProofType(bytes);
    if (!kind) return { errorKey: "proof.errType" };

    const supabase = createServiceRoleClient();
    const { data: order } = await supabase
      .from("orders")
      .select(
        `id, order_number, status, currency, subtotal, payment_mode, reserve_amount, payment_released_at,
         stock_hold_until, charges_informed_at, ${ORDER_CHARGE_COLUMNS.join(", ")}`
      )
      .eq("id", orderId)
      .eq("customer_id", customer.id)
      .maybeSingle<Record<string, unknown> & { id: string; status: string; currency: string; payment_released_at: string | null; stock_hold_until: string | null; charges_informed_at: string | null }>();
    if (!order) return { errorKey: "proof.errOrder" };

    const holdValid = !order.stock_hold_until || new Date(order.stock_hold_until).getTime() > Date.now();
    const open =
      (order.status === "confirmed_awaiting_payment" && order.payment_released_at && holdValid) ||
      order.status === "reserved";
    if (!open || !order.charges_informed_at) return { errorKey: "proof.errClosed" };

    const { data: methods } = await supabase.rpc("available_payment_methods", { p_order_id: orderId });
    const bankEnabled = ((methods ?? []) as { method_code: string; enabled: boolean }[]).some(
      (m) => m.method_code === "bank_transfer" && m.enabled
    );
    if (!bankEnabled) return { errorKey: "proof.errMethod" };

    const { data: payments } = await supabase
      .from("payments")
      .select(`id, status, kind, method_code, proof_path, merchandise_amount, ${ORDER_CHARGE_COLUMNS.join(", ")}`)
      .eq("order_id", orderId);
    const rows = (payments ?? []) as unknown as (Parameters<typeof computeAmountDue>[1][number] & {
      id: string;
      method_code: string;
      proof_path: string | null;
    })[];

    const path = `${customer.id}/${orderId}/${randomUUID()}.${kind.ext}`;
    const { error: uploadError } = await supabase.storage
      .from(PROOF_BUCKET)
      .upload(path, bytes, { contentType: kind.mime, upsert: false });
    if (uploadError) {
      console.error("[payment-proof] upload", uploadError.message);
      return { errorKey: "proof.errUpload" };
    }

    const now = new Date().toISOString();
    const pendingBank = rows.find((p) => p.status === "pending_verification" && p.method_code === "bank_transfer");

    if (pendingBank) {
      const { data: updated, error } = await supabase
        .from("payments")
        .update({ proof_path: path, proof_name: file.name.slice(0, 200), proof_uploaded_at: now })
        .eq("id", pendingBank.id)
        .select("id");
      if (error || !updated?.length) {
        await supabase.storage.from(PROOF_BUCKET).remove([path]);
        return { errorKey: "proof.errUpload" };
      }
      if (pendingBank.proof_path) await supabase.storage.from(PROOF_BUCKET).remove([pendingBank.proof_path]);
    } else {
      const due = computeAmountDue(order as never, rows);
      if (!due) {
        await supabase.storage.from(PROOF_BUCKET).remove([path]);
        return { errorKey: "proof.errNothingDue" };
      }
      const row: Record<string, unknown> = {
        order_id: orderId,
        method_code: "bank_transfer",
        kind: due.kind,
        status: "pending_verification",
        currency: due.currency,
        merchandise_amount: due.merchandise,
        proof_path: path,
        proof_name: file.name.slice(0, 200),
        proof_uploaded_at: now,
        notes: "Comprovante enviado pelo comprador",
      };
      for (const column of ORDER_CHARGE_COLUMNS) row[column] = due.charges[column];
      const { data: inserted, error } = await supabase.from("payments").insert(row).select("id");
      if (error || !inserted?.length) {
        console.error("[payment-proof] insert", error?.message);
        await supabase.storage.from(PROOF_BUCKET).remove([path]);
        return { errorKey: "proof.errUpload" };
      }
    }

    await supabase.from("order_events").insert({
      order_id: orderId,
      actor_id: customer.id,
      event_type: "payment_proof_uploaded",
      summary: "Comprovante de transferência enviado pelo comprador (aguardando verificação)",
      details: { file: file.name.slice(0, 200), type: kind.mime, size: file.size },
    });

    revalidatePath(`/admin/pedidos/${orderId}`);
    return { ok: true };
  } catch (err) {
    console.error("[payment-proof]", err);
    return { errorKey: "proof.errUpload" };
  }
}

/**
 * Buyer came back from Stripe without paying (cancel_url). Logged once per
 * couple of minutes so a page refresh does not flood the list.
 */
export async function recordPaymentCanceled(orderId: string): Promise<void> {
  try {
    const customer = await getCurrentCustomer();
    if (!customer) return;
    const supabase = createServiceRoleClient();
    const { data: order } = await supabase
      .from("orders")
      .select("id, currency")
      .eq("id", orderId)
      .eq("customer_id", customer.id)
      .maybeSingle();
    if (!order) return;

    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("payment_attempts")
      .select("id")
      .eq("order_id", orderId)
      .eq("source", "buyer_return")
      .gte("created_at", since)
      .limit(1);
    if (recent?.length) return;

    await supabase.from("payment_attempts").insert({
      order_id: orderId,
      status: "canceled",
      source: "buyer_return",
      currency: order.currency,
      message: "O comprador voltou do Stripe sem concluir o pagamento",
    });
    await supabase.from("order_events").insert({
      order_id: orderId,
      actor_id: customer.id,
      event_type: "payment_failed",
      summary: "Pagamento com cartão não concluído (comprador cancelou no Stripe)",
    });
  } catch (err) {
    console.error("[payment-attempt]", err);
  }
}
