import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ENTITY, emptyEntity, type EntityKind, type EntityPayload } from "@/lib/entities";
import { EntityEditor } from "@/components/entity-editor";
import { EntityList, type EntityRow } from "@/components/entity-list";
import type { PickOption } from "@/components/admin-ui";

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");
const loc = (v: unknown) => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, string>;
  return { en: o.en ?? "", es: o.es ?? "", pt: o.pt ?? "" };
};
const today = () => new Date().toISOString().slice(0, 10);

/** Only the item's own schedule (collections) hides it; a paid placement ending only removes the paid highlight. */
function visibility(r: Row): EntityRow["visibility"] {
  const t = today();
  if (!r.active) return { label: "Desligado", tone: "off" };
  const ss = s(r.starts_at);
  const se = s(r.ends_at);
  if (se && se < t) return { label: "Programação encerrada (oculto)", tone: "warn" };
  if (ss && ss > t) return { label: "Agendado", tone: "warn" };
  return { label: "Visível no site", tone: "ok" };
}

async function productOptions(): Promise<PickOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("id, title, slug, status").neq("status", "archived").order("title").limit(3000);
  return (data ?? []).map((p) => ({ id: p.id, label: p.title, sub: `${p.slug}${p.status !== "published" ? " · rascunho" : ""}` }));
}

export async function EntityListPage({ kind }: { kind: EntityKind }) {
  const cfg = ENTITY[kind];
  const supabase = await createClient();
  const { data } = await supabase.from(cfg.table).select("*").order("sort").order("created_at", { ascending: false });
  const list = (data ?? []) as Row[];

  // product counts per entity
  const counts = new Map<string, number>();
  if (kind === "brands") {
    const { data: ps } = await supabase.from("products").select("brand_id").not("brand_id", "is", null);
    for (const p of ps ?? []) counts.set(p.brand_id as string, (counts.get(p.brand_id as string) ?? 0) + 1);
  } else if (kind === "collections" || kind === "edits") {
    const table = kind === "collections" ? "collection_products" : "tdp_edit_products";
    const fk = kind === "collections" ? "collection_id" : "edit_id";
    const { data: ps } = await supabase.from(table).select(fk);
    for (const p of (ps ?? []) as unknown as Row[]) counts.set(s(p[fk]), (counts.get(s(p[fk])) ?? 0) + 1);
  } else {
    const { data: imgs } = await supabase.from("lookbook_images").select("lookbook_id");
    for (const p of imgs ?? []) counts.set(p.lookbook_id as string, (counts.get(p.lookbook_id as string) ?? 0) + 1);
  }

  const rows: EntityRow[] = [];
  for (const r of list) {
    let note: string | undefined;
    if (kind === "collections") {
      const { data: c } = await supabase.rpc("collection_stock_counts", { p_collection: r.id }).maybeSingle<{ total_styles: number; available_styles: number }>();
      if (c) {
        const review = Number(r.alert_review_styles) || 0;
        const low = Number(r.alert_low_styles) || 0;
        note = `${c.available_styles}/${c.total_styles} estilos disponíveis (revisão ≤ ${review}, crítico ≤ ${low})`;
        if (c.total_styles > 0 && ((low > 0 && c.available_styles <= low) || (review > 0 && c.available_styles <= review))) note = `⚠ ${note}`;
      }
    }
    if (r.paid_placement) {
      const ended = s(r.placement_end) && s(r.placement_end) < today();
      note = `${note ? `${note} · ` : ""}Placement pago: ${s(r.partner) || "—"}${r.placement_end ? ` até ${s(r.placement_end)}` : ""}${ended ? " (destaque encerrado; o item continua no site)" : ""}`;
    }
    rows.push({
      id: s(r.id),
      title: kind === "brands" ? s(r.name) : loc(r.title).en,
      slug: s(r.slug),
      cover: s(r.cover_url) || null,
      active: Boolean(r.active),
      featured: Boolean(r.featured),
      visibility: visibility(r),
      products: counts.get(s(r.id)) ?? 0,
      note,
    });
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl">{cfg.plural}</h1>
          <p className="text-sm text-muted mt-1">
            ON/OFF, ordem e placement pago. {cfg.plural} desligad{cfg.article === "a" ? "as" : "os"} não aparecem no site; o fim de um placement pago só encerra o destaque pago.
          </p>
        </div>
        <Link href={`/admin/${cfg.route}/novo`} className="bg-foreground text-background px-4 py-2 text-xs uppercase tracking-wide rounded-sm">
          Nov{cfg.article} {cfg.singular.toLowerCase()}
        </Link>
      </div>
      <EntityList kind={kind} rows={rows} />
    </div>
  );
}

export async function EntityEditPage({ kind, id }: { kind: EntityKind; id: string }) {
  const cfg = ENTITY[kind];
  const supabase = await createClient();
  const options = await productOptions();
  const [{ data: brandRows }, { data: collectionRows }] = await Promise.all([
    supabase.from("brands").select("id, name").order("name"),
    supabase.from("collections").select("id, slug, title").order("slug"),
  ]);
  const brandOptions: PickOption[] = (brandRows ?? []).map((b) => ({ id: b.id as string, label: s(b.name) }));
  const collectionOptions: PickOption[] = (collectionRows ?? []).map((c) => ({ id: c.id as string, label: loc(c.title).en || s(c.slug) }));
  let initial: EntityPayload = emptyEntity();
  let stockLine: string | undefined;

  if (id !== "novo") {
    const { data } = await supabase.from(cfg.table).select("*").eq("id", id).maybeSingle();
    if (!data) notFound();
    const r = data as Row;
    initial = {
      ...emptyEntity(),
      id: s(r.id),
      slug: s(r.slug),
      name: s(r.name),
      title: loc(r.title),
      story: loc(kind === "edits" ? r.body : r.story),
      cover_url: s(r.cover_url),
      logo_url: s(r.logo_url),
      country: s(r.country),
      active: Boolean(r.active),
      featured: Boolean(r.featured),
      sort: Number(r.sort) || 0,
      starts_at: s(r.starts_at),
      ends_at: s(r.ends_at),
      alert_min_styles: Number(r.alert_min_styles) || 0,
      alert_review_styles: r.alert_review_styles === undefined ? 10 : Number(r.alert_review_styles),
      alert_low_styles: r.alert_low_styles === undefined ? 5 : Number(r.alert_low_styles),
      alert_end_days: r.alert_end_days === undefined ? 14 : Number(r.alert_end_days),
      cover_mobile_url: s(r.cover_mobile_url),
      visible_ops: Array.isArray(r.visible_ops) ? (r.visible_ops as string[]) : emptyEntity().visible_ops,
      brand_id: s(r.brand_id),
      collection_id: s(r.collection_id),
      gallery: Array.isArray(r.gallery) ? (r.gallery as string[]) : [],
      partner: s(r.partner),
      paid_placement: Boolean(r.paid_placement),
      placement_start: s(r.placement_start),
      placement_end: s(r.placement_end),
    };
    if (kind === "brands") {
      const { data: ps } = await supabase.from("products").select("id").eq("brand_id", id).order("title");
      initial.productIds = (ps ?? []).map((p) => p.id as string);
    } else if (kind === "collections" || kind === "edits") {
      const table = kind === "collections" ? "collection_products" : "tdp_edit_products";
      const fk = kind === "collections" ? "collection_id" : "edit_id";
      const { data: ps } = await supabase.from(table).select("product_id").eq(fk, id).order("sort");
      initial.productIds = (ps ?? []).map((p) => p.product_id as string);
      if (kind === "edits") {
        const { data: bs } = await supabase.from("tdp_edit_brands").select("brand_id").eq("edit_id", id).order("sort");
        initial.brandIds = (bs ?? []).map((b) => b.brand_id as string);
      }
      if (kind === "collections") {
        const { data: c } = await supabase.rpc("collection_stock_counts", { p_collection: id }).maybeSingle<{ total_styles: number; available_styles: number }>();
        if (c) stockLine = `Estilos disponíveis: ${c.available_styles}/${c.total_styles} (publicados com estoque)`;
      }
    } else {
      const { data: imgs } = await supabase.from("lookbook_images").select("id, image_url, caption, sort").eq("lookbook_id", id).order("sort");
      const { data: links } = await supabase
        .from("lookbook_image_products")
        .select("image_id, product_id, sort")
        .in("image_id", (imgs ?? []).map((i) => i.id))
        .order("sort");
      initial.images = (imgs ?? []).map((i) => ({
        id: i.id as string,
        image_url: s(i.image_url),
        caption: loc(i.caption),
        productIds: (links ?? []).filter((l) => l.image_id === i.id).map((l) => l.product_id as string),
      }));
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/admin/${cfg.route}`} className="text-xs text-muted hover:underline">
          ← {cfg.plural}
        </Link>
        <h1 className="font-serif text-2xl mt-1">{id === "novo" ? `Nov${cfg.article} ${cfg.singular.toLowerCase()}` : cfg.singular}</h1>
      </div>
      <EntityEditor kind={kind} initial={initial} productOptions={options} brandOptions={brandOptions} collectionOptions={collectionOptions} stockLine={stockLine} />
    </div>
  );
}
