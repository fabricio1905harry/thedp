/**
 * One codebase, two deployments (Vercel projects). APP_TARGET selects what a
 * deployment serves:
 *
 *   site   → storefront only (/pt /en /es …, /api/events). /admin → 404.
 *   admin  → admin panel only (/admin, /api/cron, /api/ingest). Everything
 *            else redirects to /admin.
 *   (unset) → both, for local development and the legacy single deploy.
 *
 * Both deployments use the same Supabase project and env vars; only the
 * public domain and the routes they answer change.
 */
export type AppTarget = "site" | "admin" | "all";

export function getAppTarget(): AppTarget {
  const value = (process.env.APP_TARGET ?? "").trim().toLowerCase();
  return value === "site" || value === "admin" ? value : "all";
}

/** API route prefixes, by the deployment that owns them. */
const ADMIN_API = ["/api/cron", "/api/ingest"];
const SITE_API = ["/api/events", "/api/stripe", "/api/cms-status"];

export function apiOwner(pathname: string): "admin" | "site" | null {
  if (ADMIN_API.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return "admin";
  if (SITE_API.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return "site";
  return null;
}

/** True when this deployment must not answer the given route handler. */
export function isApiBlocked(pathname: string, target: AppTarget = getAppTarget()): boolean {
  if (target === "all") return false;
  const owner = apiOwner(pathname);
  return owner !== null && owner !== target;
}
