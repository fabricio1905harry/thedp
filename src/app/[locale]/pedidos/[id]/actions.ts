"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { queueTeamNotice, siteOrigin } from "@/lib/email";
import { BUYER_CANCELABLE_STATUSES } from "@/lib/order-status";
import { getCurrentCustomer } from "@/lib/auth";
import { computeAmountDue, ORDER_CHARGE_COLUMNS } from "@/lib/payments";
import { createStripeCheckoutSession, sessionExpiry, stripeConfigured } from "@/lib/stripe";

export interface StartCheckoutResult {
  url?: string;
  error?: string;
}

/**
 * Buyer clicks "Pay by card": validates (as the signed-in buyer, through RLS)
 * that the order is open for payment and Stripe is enabled for it
 * (channel → customer → order rules), then opens a Stripe Checkout Session
 * for exactly what is still due. The payment is only recorded — and the
 * order marked paid — by the webhook once Stripe confirms the charge.
 */
export async function startStripeCheckout(orderId: string, locale: string): Promise<StartCheckoutResult> {
  try {
    const customer = await getCurrentCustomer();
    if (!customer) return { error: "Please sign in again." };
    if (!stripeConfigured()) return { error: "Card payments are not available yet." };

    const supabase = await createClient();
    const { data: order } = await supabase
      .from("orders")
      .select(
        `id, order_number, status, currency, subtotal, payment_mode, reserve_amount, payment_released_at,
         stock_hold_until, charges_informed_at, ${ORDER_CHARGE_COLUMNS.join(", ")}`
      )
      .eq("id", orderId)
      .eq("customer_id", customer.id)
      .maybeSingle<Record<string, unknown> & {
        id: string;
        order_number: string | null;
        status: string;
        currency: string;
        subtotal: number;
        payment_mode: string;
        reserve_amount: number | null;
        payment_released_at: string | null;
        stock_hold_until: string | null;
        charges_informed_at: string | null;
      }>();
    if (!order) return { error: "Order not found." };

    const holdValid = !order.stock_hold_until || new Date(order.stock_hold_until).getTime() > Date.now();
    const open =
      (order.status === "confirmed_awaiting_payment" && order.payment_released_at && holdValid) ||
      order.status === "reserved";
    if (!open || !order.charges_informed_at) return { error: "This order is not open for payment." };

    const { data: methods } = await supabase.rpc("available_payment_methods", { p_order_id: orderId });
    const stripeEnabled = ((methods ?? []) as { method_code: string; enabled: boolean }[]).some(
      (m) => m.method_code === "stripe_card" && m.enabled
    );
    if (!stripeEnabled) return { error: "Card payment is not enabled for this order." };

    const { data: payments } = await supabase
      .from("payments")
      .select(`status, kind, merchandise_amount, ${ORDER_CHARGE_COLUMNS.join(", ")}`)
      .eq("order_id", orderId);
    const due = computeAmountDue(order, (payments ?? []) as unknown as Parameters<typeof computeAmountDue>[1]);
    if (!due) return { error: "Nothing is due on this order." };

    const metadata: Record<string, string> = {
      order_id: order.id,
      kind: due.kind,
      merchandise_amount: String(due.merchandise),
    };
    for (const column of ORDER_CHARGE_COLUMNS) {
      if (due.charges[column] > 0) metadata[column] = String(due.charges[column]);
    }

    const headerList = await headers();
    const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
    const proto = headerList.get("x-forwarded-proto") ?? "https";
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? `${proto}://${host}`;
    const orderUrl = `${origin}/${locale}/pedidos/${order.id}`;
    const ref = order.order_number ?? order.id.slice(0, 8);

    const session = await createStripeCheckoutSession({
      currency: due.currency,
      amount: due.total,
      productName: `The Dressing Project — order ${ref}${due.kind === "reserve_deposit" ? " (reserve deposit)" : due.kind === "balance" ? " (balance)" : ""}`,
      successUrl: `${orderUrl}?paid=1`,
      cancelUrl: orderUrl,
      customerEmail: customer.email,
      clientReferenceId: order.id,
      metadata,
      // an old payment link must stop working when the inventory reservation ends
      expiresAt: sessionExpiry(order.stock_hold_until),
    });
    return { url: session.url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start the payment." };
  }
}

export interface BuyerActionResult {
  ok?: boolean;
  /** error code, translated by the client (order.actionErrors.*) */
  error?: "auth" | "notFound" | "notCancelable" | "failed" | "invalid";
}

/**
 * Buyer cancels an Order Request. Ownership and status are checked on the
 * server; the update only applies while the order is still in a cancelable
 * status and unpaid (row count is verified, so a race with the TDP releasing
 * the order never cancels silently).
 */
export async function cancelOrderRequest(orderId: string, reason?: string): Promise<BuyerActionResult> {
  try {
    const customer = await getCurrentCustomer();
    if (!customer) return { error: "auth" };
    const supabase = createServiceRoleClient();

    const { data: order } = await supabase
      .from("orders")
      .select("id, order_number, status")
      .eq("id", orderId)
      .eq("customer_id", customer.id)
      .maybeSingle();
    if (!order) return { error: "notFound" };
    if (!BUYER_CANCELABLE_STATUSES.includes(order.status)) return { error: "notCancelable" };

    const { data: paid } = await supabase.from("payments").select("id").eq("order_id", orderId).in("status", ["pending_verification", "confirmed"]).limit(1);
    if (paid && paid.length > 0) return { error: "notCancelable" };

    const { data: updated, error } = await supabase
      .from("orders")
      .update({
        status: "canceled",
        canceled_at: new Date().toISOString(),
        canceled_by_buyer: true,
        cancel_reason: (reason ?? "").trim().slice(0, 500) || null,
      })
      .eq("id", orderId)
      .in("status", BUYER_CANCELABLE_STATUSES)
      .select("id");
    if (error || !updated || updated.length === 0) return { error: "failed" };

    await supabase.from("order_events").insert({
      order_id: orderId,
      actor_id: customer.id,
      event_type: "canceled_by_buyer",
      summary: `Pedido cancelado pelo comprador${reason?.trim() ? `: ${reason.trim().slice(0, 200)}` : ""}`,
    });
    await supabase.rpc("resolve_action", { p_dedupe: `order_above_stock:${orderId}` });

    const origin = siteOrigin();
    await queueTeamNotice("internal_new_contact", {
      subject: "Pedido cancelado pelo comprador",
      sender: customer.email,
      email: customer.email,
      order_number: order.order_number,
      message: `O comprador cancelou o pedido ${order.order_number ?? ""}.${reason?.trim() ? `\nMotivo: ${reason.trim().slice(0, 500)}` : ""}`,
      admin_url: origin ? `${origin}/admin/pedidos/${orderId}` : "",
    });

    revalidatePath("/[locale]/minha-conta", "page");
    revalidatePath(`/[locale]/pedidos/${orderId}`, "page");
    revalidatePath("/admin/pedidos");
    return { ok: true };
  } catch {
    return { error: "failed" };
  }
}

/**
 * Return / after-sale request: becomes a contact message (subject "return")
 * that references the order, so it shows in Admin → Contatos and in the
 * Action Center (contact_message feeder).
 */
export async function requestOrderReturn(orderId: string, message: string, locale: string): Promise<BuyerActionResult> {
  try {
    const customer = await getCurrentCustomer();
    if (!customer) return { error: "auth" };
    const text = (message ?? "").trim();
    if (text.length < 5) return { error: "invalid" };

    const supabase = createServiceRoleClient();
    const { data: order } = await supabase
      .from("orders")
      .select("id, order_number, status")
      .eq("id", orderId)
      .eq("customer_id", customer.id)
      .maybeSingle();
    if (!order) return { error: "notFound" };
    if (BUYER_CANCELABLE_STATUSES.includes(order.status) || order.status === "canceled") return { error: "notCancelable" };

    const { data: profile } = await supabase.from("customers").select("name, company_name, phone, country").eq("id", customer.id).maybeSingle();
    const ref = order.order_number ?? order.id.slice(0, 8);
    const { error } = await supabase.from("contact_messages").insert({
      name: (profile?.name || profile?.company_name || customer.email).slice(0, 200),
      company: profile?.company_name ?? null,
      email: customer.email,
      phone: profile?.phone ?? null,
      country: profile?.country ?? null,
      subject: "return",
      message: `[${ref}] ${text}`.slice(0, 5000),
      locale: ["en", "es", "pt"].includes(locale) ? locale : "en",
      customer_id: customer.id,
      order_id: order.id,
      order_number: order.order_number,
    });
    if (error) return { error: "failed" };

    const origin = siteOrigin();
    await queueTeamNotice("internal_new_contact", {
      subject: "Devolução / pós-venda",
      sender: profile?.name || customer.email,
      email: customer.email,
      order_number: ref,
      message: text,
      admin_url: origin ? `${origin}/admin/contatos?status=new` : "",
    });
    revalidatePath("/admin/contatos");
    return { ok: true };
  } catch {
    return { error: "failed" };
  }
}
