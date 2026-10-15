import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Hourly job: closes expired Temporary Stock Hold windows (status PAYMENT
 * WINDOW EXPIRED, payment disabled, buyer e-mail queued, Action Center
 * follow-up raised — see expire_unpaid_orders() in migration 0026).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("expire_unpaid_orders");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expiredOrders: data });
}
