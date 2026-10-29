import { NextResponse } from "next/server";
import { isApiBlocked } from "@/lib/app-target";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { flushEmailOutbox } from "@/lib/email";
import { processAbandonedCarts } from "@/lib/abandoned-carts";
import { processMessagingQueue } from "@/lib/notifications";
import { sendPlacementReminders } from "@/lib/placement-reminders";

/**
 * Hourly job: closes expired Temporary Stock Hold windows (status PAYMENT
 * WINDOW EXPIRED, payment disabled, buyer e-mail queued, Action Center
 * follow-up raised — see expire_unpaid_orders() in migration 0026).
 */
export async function GET(request: Request) {
  // vercel.json crons are shared by both Vercel projects; only the admin
  // deployment runs them (answer 200 so the site project's cron stays green).
  if (isApiBlocked("/api/cron")) return NextResponse.json({ skipped: "not the admin deployment" });
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("expire_unpaid_orders");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Post-payment operations (stream 4): reminders are queued first, then e-mail/WhatsApp/SMS go out.
  const postPay: Record<string, unknown> = {};
  const attempt = async (name: string, fn: () => PromiseLike<unknown>) => {
    try {
      postPay[name] = await fn();
    } catch (err) {
      postPay[name] = { error: err instanceof Error ? err.message : "failed" };
    }
  };
  await attempt("paymentWindowReminders", async () => (await supabase.rpc("queue_payment_window_reminders")).data);
  await attempt("reserveStages", async () => (await supabase.rpc("refresh_reserve_stages")).data);
  await attempt("reserveReminders", async () => (await supabase.rpc("queue_reserve_reminders")).data);
  await attempt("placementActions", async () => (await supabase.rpc("refresh_placement_actions")).data);
  await attempt("placementReminders", () => sendPlacementReminders(supabase));
  await attempt("collectionAlerts", async () => (await supabase.rpc("refresh_all_collection_alerts")).data);
  await attempt("sizeMapping", async () => (await supabase.rpc("refresh_size_mapping_action")).data);
  await attempt("abandonedCarts", () => processAbandonedCarts());
  const email = await flushEmailOutbox(50);
  await attempt("messaging", () => processMessagingQueue(50));
  const { data: escalated } = await supabase.rpc("escalate_stale_actions");
  return NextResponse.json({ expiredOrders: data, email, escalated, postPay });
}
