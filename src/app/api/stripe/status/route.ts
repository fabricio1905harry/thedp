import { NextResponse } from "next/server";
import { isApiBlocked } from "@/lib/app-target";
import { stripeMode } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Lets the Admin check how Stripe is configured on the SITE deployment (the one that
 * receives the webhook). Only booleans and the mode — never a key or secret.
 */
export async function GET() {
  if (isApiBlocked("/api/stripe/status")) return new NextResponse("Not found", { status: 404 });
  return NextResponse.json(
    {
      mode: stripeMode(),
      secretKey: Boolean(process.env.STRIPE_SECRET_KEY),
      webhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      siteUrl: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
