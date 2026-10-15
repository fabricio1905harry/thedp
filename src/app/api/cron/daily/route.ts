import { NextResponse } from "next/server";
import { isApiBlocked } from "@/lib/app-target";
import { updateFxRatesNow } from "@/lib/fx-auto";
import { getSetting } from "@/lib/settings";

/**
 * Daily job (vercel.json cron): automatic FX update. Protected by
 * CRON_SECRET (Vercel sends it as a Bearer token).
 */
export async function GET(request: Request) {
  // vercel.json crons are shared by both Vercel projects; only the admin
  // deployment runs them (answer 200 so the site project's cron stays green).
  if (isApiBlocked("/api/cron")) return NextResponse.json({ skipped: "not the admin deployment" });
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const fxAuto = await getSetting<{ enabled?: boolean }>("fx_auto");
  if (fxAuto && fxAuto.enabled === false) {
    return NextResponse.json({ fx: "disabled" });
  }
  const fx = await updateFxRatesNow("cron");
  return NextResponse.json({ fx });
}
