import { NextResponse } from "next/server";
import { isApiBlocked } from "@/lib/app-target";
import { getCmsStatus } from "@/lib/cms";

export const dynamic = "force-dynamic";

/** Lets the Admin check that the storefront really reads the CMS table. */
export async function GET() {
  if (isApiBlocked("/api/cms-status")) return new NextResponse("Not found", { status: 404 });
  const status = await getCmsStatus();
  return NextResponse.json(status, { headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } });
}
