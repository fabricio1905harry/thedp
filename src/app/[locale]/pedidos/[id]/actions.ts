"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCustomer } from "@/lib/auth";
import { computeAmountDue, ORDER_CHARGE_COLUMNS } from "@/lib/payments";
import { createStripeCheckoutSession, stripeConfigured } from "@/lib/stripe";

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
    });
    return { url: session.url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start the payment." };
  }
}
