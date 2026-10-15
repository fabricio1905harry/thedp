import createIntlMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { getAppTarget } from "./lib/app-target";
import {
  SITE_MODE_COOKIE,
  SITE_MODE_HEADER,
  resolveSiteMode,
} from "./lib/site-mode";

const intlMiddleware = createIntlMiddleware(routing);

export function proxy(request: NextRequest) {
  const target = getAppTarget();
  const { pathname } = request.nextUrl;
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");

  // Separate deployments (APP_TARGET): the site never serves the admin and
  // the admin deployment never serves the storefront.
  if (target === "site" && isAdminPath) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (target === "admin" && !isAdminPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // /admin is an internal tool with no locale prefix — don't run it
  // through next-intl's locale routing.
  if (isAdminPath) {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
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
