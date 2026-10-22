import { NextResponse } from "next/server";
import { isApiBlocked } from "@/lib/app-target";
import { fxRunIsDue, getFxSettings, updateFxRatesNow } from "@/lib/fx-auto";

/**
 * Daily job (vercel.json cron): automatic FX update, respecting the
 * frequency (daily/weekly) and source chosen in Admin → Câmbio. Protected by
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
  const settings = await getFxSettings();
  if (!settings.enabled) return NextResponse.json({ fx: "disabled" });
  if (!fxRunIsDue(settings)) return NextResponse.json({ fx: "not due", frequency: settings.frequency });
  const fx = await updateFxRatesNow("cron");
  return NextResponse.json({ fx });
}
