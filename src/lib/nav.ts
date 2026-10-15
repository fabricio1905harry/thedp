import type { CustomerStatus } from "@/lib/types";

/**
 * Main menu. SHOP / ABOUT / CONTACT are live; COLLECTIONS, LOOKBOOKS, BRANDS
 * and EDITS join automatically once their pages exist (phase 2) and have
 * active entries — until then they are not rendered, so there are no dead links.
 */
export interface NavEntry {
  key: "shop" | "collections" | "lookbooks" | "brands" | "edits" | "about" | "contact";
  href: string;
}

export function mainNav(extra: { collections?: boolean; lookbooks?: boolean; brands?: boolean; edits?: boolean } = {}): NavEntry[] {
  return [
    { key: "shop", href: "/shop" },
    ...(extra.brands ? [{ key: "brands" as const, href: "/marcas" }] : []),
    ...(extra.collections ? [{ key: "collections" as const, href: "/colecoes" }] : []),
    ...(extra.lookbooks ? [{ key: "lookbooks" as const, href: "/lookbooks" }] : []),
    ...(extra.edits ? [{ key: "edits" as const, href: "/edits" }] : []),
    { key: "about", href: "/sobre" },
    { key: "contact", href: "/contato" },
  ];
}

export function statusKey(status: CustomerStatus): "statusApproved" | "statusPending" | "statusMoreInfo" | "statusRejected" {
  return status === "approved"
    ? "statusApproved"
    : status === "more_info"
      ? "statusMoreInfo"
      : status === "rejected"
        ? "statusRejected"
        : "statusPending";
}
