export type SiteMode = "internacional" | "nacional";

export const SITE_MODE_HEADER = "x-site-mode";
export const SITE_MODE_COOKIE = "site_mode";

/**
 * NAC-02/NAC-03: the .com.br domain is a catalog-only mirror with no DHL,
 * no carrier integration, and no checkout. Everything else is "internacional".
 * Local/dev override: append ?site=nacional or set SITE_MODE_DEV_OVERRIDE.
 */
export function resolveSiteMode(hostname: string): SiteMode {
  const host = hostname.toLowerCase();
  if (host.endsWith(".com.br") || host.includes("localhost.com.br")) {
    return "nacional";
  }
  return "internacional";
}
