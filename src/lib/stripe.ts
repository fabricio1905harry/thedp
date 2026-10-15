import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal Stripe client (REST, no SDK). Env (site deployment):
 *   STRIPE_SECRET_KEY      sk_live_… / sk_test_…
 *   STRIPE_WEBHOOK_SECRET  whsec_… of the endpoint https://<site>/api/stripe/webhook
 */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export interface CheckoutSessionInput {
  currency: string;
  amount: number; // major units (e.g. 1234.50)
  productName: string;
  description?: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  clientReferenceId: string;
  metadata: Record<string, string>;
}

export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

export async function createStripeCheckoutSession(input: CheckoutSessionInput): Promise<{ id: string; url: string }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY).");

  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("payment_method_types[0]", "card");
  body.set("success_url", input.successUrl);
  body.set("cancel_url", input.cancelUrl);
  body.set("client_reference_id", input.clientReferenceId);
  if (input.customerEmail) body.set("customer_email", input.customerEmail);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", input.currency.toLowerCase());
  body.set("line_items[0][price_data][unit_amount]", String(toMinorUnits(input.amount)));
  body.set("line_items[0][price_data][product_data][name]", input.productName);
  if (input.description) body.set("line_items[0][price_data][product_data][description]", input.description);
  for (const [k, v] of Object.entries(input.metadata)) {
    body.set(`metadata[${k}]`, v);
    body.set(`payment_intent_data[metadata][${k}]`, v);
  }

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
  if (!res.ok || !json.url || !json.id) {
    throw new Error(json.error?.message ?? `Stripe error (${res.status})`);
  }
  return { id: json.id, url: json.url };
}

/**
 * Verifies the `Stripe-Signature` header (t=timestamp,v1=hmac_sha256(t.payload)).
 * Rejects stale timestamps (default 5 min) to block replays.
 */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
  nowMs = Date.now()
): boolean {
  if (!header || !secret) return false;
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") timestamp = v;
    if (k === "v1" && v) signatures.push(v);
  }
  if (!timestamp || signatures.length === 0) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  return signatures.some((sig) => {
    const buf = Buffer.from(sig, "hex");
    return buf.length === expectedBuf.length && timingSafeEqual(buf, expectedBuf);
  });
}
