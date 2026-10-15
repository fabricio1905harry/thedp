import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** Whitelisted first-party analytics events (e.g. whatsapp_click). */
const ALLOWED_EVENTS = new Set(["whatsapp_click"]);

function clip(value: unknown, max: number): string | null {
  return typeof value === "string" && value ? value.slice(0, max) : null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const event = clip(body.event, 64);
    if (!event || !ALLOWED_EVENTS.has(event)) {
      return NextResponse.json({ error: "Unknown event" }, { status: 400 });
    }
    const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : null;
    if (metadata && JSON.stringify(metadata).length > 2000) {
      return NextResponse.json({ error: "Metadata too large" }, { status: 413 });
    }

    const supabase = createServiceRoleClient();
    await supabase.from("analytics_events").insert({
      event,
      path: clip(body.path, 512),
      source: clip(body.source, 256),
      locale: clip(body.locale, 8),
      metadata,
    });
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
