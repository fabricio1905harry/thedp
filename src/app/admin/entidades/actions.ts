"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { guardStaff, slugify } from "@/lib/admin-guard";
import { ENTITY, isEntityKind, type EntityPayload } from "@/lib/entities";
import { normalizeImageUrl } from "@/lib/image-url";

type Result = { error?: string; ok?: boolean; id?: string };

function refresh(route: string) {
  revalidatePath(`/admin/${route}`);
  revalidatePath("/", "layout");
}

const loc = (v: { en?: string; es?: string; pt?: string }) => ({
  en: (v.en ?? "").trim().slice(0, 8000),
  es: (v.es ?? "").trim().slice(0, 8000),
  pt: (v.pt ?? "").trim().slice(0, 8000),
});
const date = (v: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const img = (v: string) => (normalizeImageUrl(v.trim(), 2400) ?? "") || null;

function dbError(message: string, code?: string) {
  return code === "23505" ? "Já existe um registro com esse endereço (slug). Use outro." : message;
}

export async function saveEntity(kind: string, p: EntityPayload): Promise<Result> {
  if (!isEntityKind(kind)) return { error: "Tipo desconhecido." };
  const g = await guardStaff();
  if (!g.staff) return { error: g.error };
  const cfg = ENTITY[kind];

  const label = kind === "brands" ? p.name.trim() : (p.title.en ?? "").trim();
  if (!label) return { error: kind === "brands" ? "Informe o nome da marca." : "Informe o título em inglês (EN é o idioma principal)." };
  const slug = slugify(p.slug || label);
  if (!slug) return { error: "Informe um endereço (slug) válido." };
  const ps = date(p.placement_start);
  const pe = date(p.placement_end);
  if (ps && pe && pe < ps) return { error: "A data final do placement é anterior à inicial." };
  const ss = date(p.starts_at);
  const se = date(p.ends_at);
  if (ss && se && se < ss) return { error: "O fim da programação é anterior ao início." };
  if (p.paid_placement && !p.partner.trim()) return { error: "Placement pago: informe o nome do parceiro." };

  const base = {
    slug,
    cover_url: img(p.cover_url),
    active: p.active,
    featured: p.featured,
    sort: Number.isFinite(p.sort) ? Math.round(p.sort) : 100,
    partner: p.partner.trim() || null,
    paid_placement: p.paid_placement,
    placement_start: ps,
    placement_end: pe,
    updated_at: new Date().toISOString(),
  };
  const row: Record<string, unknown> =
    kind === "brands"
      ? { ...base, name: label, logo_url: img(p.logo_url), country: p.country.trim() || null, story: loc(p.story) }
      : kind === "collections"
        ? {
            ...base,
            title: loc(p.title),
            story: loc(p.story),
            starts_at: ss,
            ends_at: se,
            alert_min_styles: Math.max(0, Math.round(Number(p.alert_min_styles) || 0)),
          }
        : kind === "lookbooks"
          ? { ...base, title: loc(p.title), story: loc(p.story) }
          : { ...base, title: loc(p.title), body: loc(p.story) };

  const supabase = await createClient();
  let id = p.id;
  if (id) {
    const { data, error } = await supabase.from(cfg.table).update(row).eq("id", id).select("id");
    if (error) return { error: dbError(error.message, error.code) };
    if (!data || data.length === 0) return { error: "Registro não encontrado (nenhuma linha alterada)." };
  } else {
    const { data, error } = await supabase.from(cfg.table).insert(row).select("id").single();
    if (error || !data) return { error: dbError(error?.message ?? "Falha ao criar.", error?.code) };
    id = data.id as string;
  }

  const productIds = [...new Set(p.productIds)];

  if (kind === "brands") {
    const { error: e1 } = await supabase.from("products").update({ brand_id: null }).eq("brand_id", id);
    if (e1) return { error: e1.message };
    if (productIds.length > 0) {
      const { error: e2 } = await supabase.from("products").update({ brand_id: id }).in("id", productIds);
      if (e2) return { error: e2.message };
    }
  } else if (kind === "collections" || kind === "edits") {
    const table = kind === "collections" ? "collection_products" : "tdp_edit_products";
    const fk = kind === "collections" ? "collection_id" : "edit_id";
    const { error: e1 } = await supabase.from(table).delete().eq(fk, id);
    if (e1) return { error: e1.message };
    if (productIds.length > 0) {
      const { error: e2 } = await supabase.from(table).insert(productIds.map((pid, i) => ({ [fk]: id, product_id: pid, sort: i })));
      if (e2) return { error: e2.message };
    }
  } else if (kind === "lookbooks") {
    const { data: existing } = await supabase.from("lookbook_images").select("id").eq("lookbook_id", id);
    const keep = new Set(p.images.map((i) => i.id).filter(Boolean) as string[]);
    const drop = (existing ?? []).map((r) => r.id as string).filter((x) => !keep.has(x));
    if (drop.length > 0) {
      const { error } = await supabase.from("lookbook_images").delete().in("id", drop);
      if (error) return { error: error.message };
    }
    for (let i = 0; i < p.images.length; i++) {
      const im = p.images[i];
      const url = img(im.image_url);
      if (!url) return { error: `Imagem ${i + 1}: informe a imagem.` };
      const imageRow = { lookbook_id: id, image_url: url, caption: loc(im.caption), sort: i };
      let imageId = im.id;
      if (imageId) {
        const { data, error } = await supabase.from("lookbook_images").update(imageRow).eq("id", imageId).select("id");
        if (error) return { error: error.message };
        if (!data || data.length === 0) return { error: `Imagem ${i + 1}: não encontrada.` };
      } else {
        const { data, error } = await supabase.from("lookbook_images").insert(imageRow).select("id").single();
        if (error || !data) return { error: error?.message ?? "Falha ao salvar imagem." };
        imageId = data.id as string;
      }
      const { error: d } = await supabase.from("lookbook_image_products").delete().eq("image_id", imageId);
      if (d) return { error: d.message };
      const ids = [...new Set(im.productIds)];
      if (ids.length > 0) {
        const { error } = await supabase
          .from("lookbook_image_products")
          .insert(ids.map((pid, k) => ({ image_id: imageId, product_id: pid, sort: k })));
        if (error) return { error: error.message };
      }
    }
  }

  refresh(cfg.route);
  return { ok: true, id };
}

export async function toggleEntity(kind: string, id: string, active: boolean): Promise<Result> {
  if (!isEntityKind(kind)) return { error: "Tipo desconhecido." };
  const g = await guardStaff();
  if (!g.staff) return { error: g.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from(ENTITY[kind].table).update({ active, updated_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Registro não encontrado (nenhuma linha alterada)." };
  refresh(ENTITY[kind].route);
  return { ok: true };
}

/** Swap order with the neighbour above/below (the list is ordered by sort, then creation). */
export async function moveEntity(kind: string, id: string, direction: "up" | "down"): Promise<Result> {
  if (!isEntityKind(kind)) return { error: "Tipo desconhecido." };
  const g = await guardStaff();
  if (!g.staff) return { error: g.error };
  const supabase = await createClient();
  const { data } = await supabase.from(ENTITY[kind].table).select("id").order("sort").order("created_at", { ascending: false });
  const ids = (data ?? []).map((r) => r.id as string);
  const i = ids.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return { ok: true };
  [ids[i], ids[j]] = [ids[j], ids[i]];
  for (let k = 0; k < ids.length; k++) {
    const { error } = await supabase.from(ENTITY[kind].table).update({ sort: (k + 1) * 10 }).eq("id", ids[k]);
    if (error) return { error: error.message };
  }
  refresh(ENTITY[kind].route);
  return { ok: true };
}

export async function deleteEntity(kind: string, id: string): Promise<Result> {
  if (!isEntityKind(kind)) return { error: "Tipo desconhecido." };
  const g = await guardStaff();
  if (!g.staff) return { error: g.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from(ENTITY[kind].table).delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Registro não encontrado (nenhuma linha removida)." };
  refresh(ENTITY[kind].route);
  return { ok: true };
}
