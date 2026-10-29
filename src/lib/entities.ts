/** Brands / Collections / Lookbooks / TDP Edits share one admin editor (migration 0051). Client-safe. */

export type EntityKind = "brands" | "collections" | "lookbooks" | "edits";

export const ENTITY: Record<
  EntityKind,
  { table: string; route: string; siteRoute: string; singular: string; plural: string; article: "a" | "o" }
> = {
  brands: { table: "brands", route: "marcas", siteRoute: "marcas", singular: "Marca", plural: "Marcas", article: "a" },
  collections: { table: "collections", route: "colecoes", siteRoute: "colecoes", singular: "Coleção", plural: "Coleções", article: "a" },
  lookbooks: { table: "lookbooks", route: "lookbooks", siteRoute: "lookbooks", singular: "Lookbook", plural: "Lookbooks", article: "o" },
  edits: { table: "tdp_edits", route: "edits", siteRoute: "edits", singular: "Edit", plural: "Edits", article: "o" },
};

export function isEntityKind(v: string): v is EntityKind {
  return v in ENTITY;
}

type Loc = { en?: string; es?: string; pt?: string };

export interface LookbookImageInput {
  id?: string;
  image_url: string;
  caption: Loc;
  productIds: string[];
}

export interface EntityPayload {
  id?: string;
  slug: string;
  /** brands: plain name in `name`; the others use the EN/ES/PT `title`. */
  name: string;
  title: Loc;
  /** story (brands/collections/lookbooks) — for edits this is the body text. */
  story: Loc;
  cover_url: string;
  logo_url: string;
  country: string;
  active: boolean;
  featured: boolean;
  sort: number;
  starts_at: string;
  ends_at: string;
  alert_min_styles: number;
  /** COLLECTION INVENTORY REVIEW level (styles available <=) */
  alert_review_styles: number;
  /** LOW INVENTORY — REVIEW REQUIRED level (styles available <=) */
  alert_low_styles: number;
  /** reminder days before the collection end date */
  alert_end_days: number;
  cover_mobile_url: string;
  visible_ops: string[];
  /** lookbooks: related brand / collection ("" = none) */
  brand_id: string;
  collection_id: string;
  /** edits: editorial images (URLs) and selected brands */
  gallery: string[];
  brandIds: string[];
  partner: string;
  paid_placement: boolean;
  placement_start: string;
  placement_end: string;
  productIds: string[];
  images: LookbookImageInput[];
}

export function emptyEntity(): EntityPayload {
  return {
    slug: "",
    name: "",
    title: { en: "", es: "", pt: "" },
    story: { en: "", es: "", pt: "" },
    cover_url: "",
    logo_url: "",
    country: "",
    active: false,
    featured: false,
    sort: 100,
    starts_at: "",
    ends_at: "",
    alert_min_styles: 0,
    alert_review_styles: 10,
    alert_low_styles: 5,
    alert_end_days: 14,
    cover_mobile_url: "",
    visible_ops: ["intl_b2b", "intl_b2c", "br_b2b", "br_b2c"],
    brand_id: "",
    collection_id: "",
    gallery: [],
    brandIds: [],
    partner: "",
    paid_placement: false,
    placement_start: "",
    placement_end: "",
    productIds: [],
    images: [],
  };
}
