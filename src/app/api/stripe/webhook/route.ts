import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isApiBlocked } from "@/lib/app-target";
import { verifyStripeSignature } from "@/lib/stripe";
import { ORDER_CHARGE_COLUMNS } from "@/lib/payments";

/**
 * Stripe webhook (site deployment). Configure the endpoint
 * https://<site>/api/stripe/webhook with the events:
 *   checkout.session.completed, checkout.session.async_payment_succeeded,
 *   checkout.session.expired, checkout.session.async_payment_failed,
 *   payment_intent.payment_failed,
 *   charge.refunded, charge.dispute.created
 * and put its signing secret in STRIPE_WEBHOOK_SECRET.
 *
 * A paid Checkout Session becomes a CONFIRMED payment (the DB trigger then
 * marks the order paid / reserved and recognises revenue and cost). It is
 * idempotent: payments has a unique (method, external_ref) index.
 */

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export async function POST(request: Request) {
  if (isApiBlocked("/api/stripe")) return new NextResponse("Not found", { status: 404 });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const payload = await request.text();
  if (!secret || !verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(payload) as StripeEvent;
  const supabase = createServiceRoleClient();
  const obj = event.data.object;

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      if (obj.payment_status !== "paid") return NextResponse.json({ received: true, skipped: "not paid yet" });

      const metadata = (obj.metadata ?? {}) as Record<string, string>;
      const orderId = metadata.order_id ?? (obj.client_reference_id as string | undefined);
      if (!orderId) return NextResponse.json({ received: true, skipped: "no order" });

      const { data: order } = await supabase.from("orders").select("id, currency").eq("id", orderId).maybeSingle();
      if (!order) return NextResponse.json({ received: true, skipped: "order not found" });

      const currency = String(obj.currency ?? "").toUpperCase();
      if (currency !== String(order.currency).toUpperCase()) {
        return NextResponse.json({ received: true, skipped: "currency mismatch" });
      }

      const kind = ["full", "reserve_deposit", "balance"].includes(metadata.kind) ? metadata.kind : "full";
      const row: Record<string, unknown> = {
        order_id: order.id,
        method_code: "stripe_card",
        kind,
        status: "confirmed",
        currency,
        merchandise_amount: Number(metadata.merchandise_amount ?? 0),
        received_amount: Number(obj.amount_total ?? 0) / 100, // differs from the expected total → Payment Difference
        external_ref: String(obj.payment_intent ?? obj.id),
        notes: `Stripe Checkout ${obj.id}`,
      };
      for (const column of ORDER_CHARGE_COLUMNS) row[column] = Number(metadata[column] ?? 0);

      const { error } = await supabase.from("payments").insert(row);
      if (error && error.code !== "23505") throw new Error(error.message);

      if (!error) {
        await supabase.from("order_events").insert({
          order_id: order.id,
          event_type: "payment_received",
          summary: `Card payment received via Stripe (${kind}): ${(Number(obj.amount_total ?? 0) / 100).toFixed(2)} ${currency}`,
          details: { stripe_event: event.id },
        });
      }
    } else if (
      event.type === "checkout.session.expired" ||
      event.type === "checkout.session.async_payment_failed" ||
      event.type === "payment_intent.payment_failed"
    ) {
      // Failed / expired attempt: logged for the staff; the buyer retries from the order page.
      const metadata = (obj.metadata ?? {}) as Record<string, string>;
      const orderId = metadata.order_id ?? (obj.client_reference_id as string | undefined);
      if (!orderId) return NextResponse.json({ received: true, skipped: "no order" });
      const { data: order } = await supabase.from("orders").select("id, currency").eq("id", orderId).maybeSingle();
      if (!order) return NextResponse.json({ received: true, skipped: "order not found" });

      const isIntent = event.type === "payment_intent.payment_failed";
      const status = event.type === "checkout.session.expired" ? "expired" : "failed";
      const lastError = (obj.last_payment_error ?? {}) as { message?: string };
      const amountMinor = Number((isIntent ? obj.amount : obj.amount_total) ?? 0);
      const message = isIntent
        ? lastError.message ?? "Pagamento recusado pelo emissor do cartão"
        : status === "expired"
          ? "O link de pagamento do Stripe expirou sem pagamento"
          : "Pagamento assíncrono falhou";

      const { error } = await supabase.from("payment_attempts").insert({
        order_id: order.id,
        status,
        source: "stripe_webhook",
        stripe_ref: isIntent ? `${obj.id}:${obj.latest_charge ?? event.id}` : String(obj.id),
        amount: amountMinor > 0 ? amountMinor / 100 : null,
        currency: String(obj.currency ?? order.currency).toUpperCase(),
        message,
      });
      if (error && error.code !== "23505") throw new Error(error.message);
      if (!error) {
        await supabase.from("order_events").insert({
          order_id: order.id,
          event_type: "payment_failed",
          summary: `Tentativa de pagamento com cartão ${status === "expired" ? "expirou" : "falhou"}: ${message}`,
          details: { stripe_event: event.id },
        });
      }
    } else if (event.type === "charge.refunded") {
      if (obj.refunded === true && obj.payment_intent) {
        await supabase.from("payments").update({ status: "refunded" }).eq("method_code", "stripe_card").eq("external_ref", String(obj.payment_intent));
      }
    } else if (event.type === "charge.dispute.created") {
      if (obj.payment_intent) {
        await supabase.from("payments").update({ status: "chargeback" }).eq("method_code", "stripe_card").eq("external_ref", String(obj.payment_intent));
      }
    }
  } catch (err) {
    // 500 → Stripe retries the delivery
    return NextResponse.json({ error: err instanceof Error ? err.message : "Webhook failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
