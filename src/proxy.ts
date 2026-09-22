import createIntlMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import {
  SITE_MODE_COOKIE,
  SITE_MODE_HEADER,
  resolveSiteMode,
} from "./lib/site-mode";

const intlMiddleware = createIntlMiddleware(routing);

export function proxy(request: NextRequest) {
  // /admin is an internal tool with no locale prefix — don't run it
  // through next-intl's locale routing.
  if (request.nextUrl.pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const devOverride = request.nextUrl.searchParams.get("site");
  const siteMode =
    devOverride === "nacional" || devOverride === "internacional"
      ? devOverride
      : resolveSiteMode(request.nextUrl.hostname);

  const response = intlMiddleware(request) ?? NextResponse.next();
  response.headers.set(SITE_MODE_HEADER, siteMode);
  response.cookies.set(SITE_MODE_COOKIE, siteMode, { path: "/" });
  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
