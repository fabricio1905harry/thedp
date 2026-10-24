import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point of the Supabase e-mail links (password reset). Exchanges the
 * code (PKCE) or the token hash for a session and sends the buyer to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const rawNext = searchParams.get("next") ?? "/pt";
  // only same-site paths
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/pt";
  const locale = next.split("/")[1] && ["en", "es", "pt"].includes(next.split("/")[1]) ? next.split("/")[1] : "pt";

  const fail = NextResponse.redirect(`${origin}/${locale}/esqueci-senha?error=expired`);
  try {
    const supabase = await createClient();
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return fail;
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as "recovery" });
      if (error) return fail;
    } else {
      return fail;
    }
  } catch (err) {
    console.error("[auth/callback] failed:", err);
    return fail;
  }
  return NextResponse.redirect(`${origin}${next}`);
}
