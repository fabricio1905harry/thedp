"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";

export type ActionResult = { error?: string; info?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Desired delivery date + balance due date of a Reserve order (empty due date → desired date − lead days). */
export async function setReserveSchedule(orderId: string, desiredDate: string | null, dueDate: string | null): Promise<ActionResult> {
  try {
    const staff = await getCurrentStaff();
    if (!staff) return { error: "Não autorizado" };
    if ((desiredDate && !DATE_RE.test(desiredDate)) || (dueDate && !DATE_RE.test(dueDate))) return { error: "Data inválida." };
    if (!desiredDate && !dueDate) return { error: "Informe a data de entrega desejada ou o vencimento do saldo." };
    const supabase = await createClient();
    const { data: order } = await supabase.from("orders").select("id, payment_mode").eq("id", orderId).maybeSingle();
    if (!order) return { error: "Pedido não encontrado." };
    if (order.payment_mode !== "reserve") return { error: "O pedido não está no modo Reserve for Later Delivery." };

    const { data, error } = await supabase
      .from("orders")
      .update({ reserve_desired_delivery_date: desiredDate || null, reserve_balance_due_date: dueDate || null })
      .eq("id", orderId)
      .select("id, reserve_balance_due_date");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "Nada foi salvo (sem permissão?)." };
    try {
      await supabase.from("order_events").insert({
        order_id: orderId,
        actor_id: staff.id,
        event_type: "reserve",
        summary: `Reserve: entrega desejada ${desiredDate ?? "—"} · vencimento do saldo ${data[0].reserve_balance_due_date ?? "—"}`,
      });
    } catch {
      // history is best-effort
    }
    revalidatePath(`/admin/pedidos/${orderId}`);
    revalidatePath("/admin/envios-futuros");
    return { info: "Cronograma salvo." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao salvar." };
  }
}

/** Extends the storage window (default 180 days AFTER the shipping date) by `days` — a deliberate staff decision. */
export async function extendReserveWindow(orderId: string, days: number): Promise<ActionResult> {
  try {
    const staff = await getCurrentStaff();
    if (!staff) return { error: "Não autorizado" };
    if (!Number.isFinite(days) || days < 1 || days > 365) return { error: "Informe de 1 a 365 dias." };
    const supabase = await createClient();
    const { data: order } = await supabase.from("orders").select("reserve_expires_at, reserve_stage").eq("id", orderId).maybeSingle();
    if (!order) return { error: "Pedido não encontrado." };
    const base = Math.max(Date.now(), order.reserve_expires_at ? new Date(order.reserve_expires_at).getTime() : 0);
    const next = new Date(base + days * 86400_000).toISOString();
    const { data, error } = await supabase
      .from("orders")
      .update({ reserve_expires_at: next, ...(order.reserve_stage === "expired" ? { reserve_stage: "reserved" } : {}) })
      .eq("id", orderId)
      .select("id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "Nada foi salvo (sem permissão?)." };
    try {
      await supabase.from("order_events").insert({
        order_id: orderId,
        actor_id: staff.id,
        event_type: "reserve",
        summary: `Reserve: armazenagem estendida em ${days} dias (até ${next.slice(0, 10)})`,
      });
    } catch {
      // best-effort
    }
    revalidatePath(`/admin/pedidos/${orderId}`);
    revalidatePath("/admin/envios-futuros");
    return { info: "Janela estendida." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao salvar." };
  }
}
