"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";
import { getBlockDef } from "@/lib/cms-blocks";
import { getEffectiveBlocks } from "@/lib/cms";
import { OPERATIONS, type CmsScope, type FieldDef } from "@/lib/cms-types";
import { normalizeImageUrl } from "@/lib/image-url";

async function requireStaff() {
  const staff = await getCurrentStaff();
  if (!staff) throw new Error("Not authorized");
  return staff;
}

function refresh() {
  revalidatePath("/", "layout");
  revalidatePath("/admin/conteudo");
}

/** Keeps only declared fields and cleans values (Drive links → direct URLs, numbers, lists). */
function sanitize(fields: FieldDef[], raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = raw[field.key];
    if (value === undefined) continue;
    if (field.kind === "list") {
      const items = Array.isArray(value) ? value : [];
      out[field.key] = items
        .filter((i) => i && typeof i === "object")
        .map((i) => sanitize(field.itemFields ?? [], i as Record<string, unknown>));
    } else if (field.translatable) {
      const v = (value ?? {}) as Record<string, unknown>;
      out[field.key] = {
        en: String(v.en ?? "").slice(0, 4000),
        es: String(v.es ?? "").slice(0, 4000),
        pt: String(v.pt ?? "").slice(0, 4000),
      };
    } else if (field.kind === "image") {
      out[field.key] = normalizeImageUrl(String(value ?? "")) ?? "";
    } else if (field.kind === "number") {
      const n = Number(value);
      out[field.key] = Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 48) : 6;
    } else if (field.kind === "boolean") {
      out[field.key] = Boolean(value);
    } else if (field.kind === "slugs") {
      const list = Array.isArray(value) ? value : String(value).split(/[\n,]/);
      out[field.key] = list.map((s) => String(s).trim()).filter(Boolean).slice(0, 48);
    } else {
      out[field.key] = String(value ?? "").trim().slice(0, 2000);
    }
  }
  return out;
}

export interface SaveBlockInput {
  active: boolean;
  operations: string[];
  content: Record<string, unknown>;
  partner?: string;
  placementStart?: string;
  placementEnd?: string;
}

export async function saveCmsBlock(scope: CmsScope, key: string, input: SaveBlockInput) {
  const staff = await requireStaff();
  const def = getBlockDef(scope, key);
  if (!def) throw new Error("Unknown block");
  const validOps = new Set(OPERATIONS.map((o) => o.code as string));
  const operations = input.operations.filter((o) => validOps.has(o));

  const supabase = await createClient();
  const { data: existing } = await supabase.from("cms_blocks").select("sort").eq("scope", scope).eq("block_key", key).maybeSingle();
  const { error } = await supabase.from("cms_blocks").upsert({
    scope,
    block_key: key,
    active: input.active,
    sort: existing?.sort ?? null,
    operations,
    content: sanitize(def.fields, input.content),
    partner: def.placement ? input.partner?.trim() || null : null,
    placement_start: def.placement && input.placementStart ? input.placementStart : null,
    placement_end: def.placement && input.placementEnd ? input.placementEnd : null,
    updated_at: new Date().toISOString(),
    updated_by: staff.id,
  });
  if (error) throw new Error(error.message);
  refresh();
}

/** ON/OFF without opening the editor (keeps the rest of the override). */
export async function toggleCmsBlock(scope: CmsScope, key: string, active: boolean) {
  const staff = await requireStaff();
  if (!getBlockDef(scope, key)) throw new Error("Unknown block");
  const supabase = await createClient();
  const { data: row } = await supabase.from("cms_blocks").select("scope").eq("scope", scope).eq("block_key", key).maybeSingle();
  const { error } = row
    ? await supabase.from("cms_blocks").update({ active, updated_at: new Date().toISOString(), updated_by: staff.id }).eq("scope", scope).eq("block_key", key)
    : await supabase.from("cms_blocks").insert({ scope, block_key: key, active, updated_by: staff.id });
  if (error) throw new Error(error.message);
  refresh();
}

/** Swap display order with the neighbour above/below. */
export async function moveCmsBlock(scope: CmsScope, key: string, direction: "up" | "down") {
  const staff = await requireStaff();
  const blocks = await getEffectiveBlocks(scope);
  const idx = blocks.findIndex((b) => b.def.key === key);
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || target < 0 || target >= blocks.length) return;

  const reordered = [...blocks];
  [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];

  const supabase = await createClient();
  for (let i = 0; i < reordered.length; i++) {
    const b = reordered[i];
    const sort = (i + 1) * 10;
    if (sort === b.sort && b.customised) continue;
    const { data: row } = await supabase.from("cms_blocks").select("scope").eq("scope", scope).eq("block_key", b.def.key).maybeSingle();
    const { error } = row
      ? await supabase.from("cms_blocks").update({ sort, updated_by: staff.id }).eq("scope", scope).eq("block_key", b.def.key)
      : await supabase.from("cms_blocks").insert({ scope, block_key: b.def.key, sort, updated_by: staff.id });
    if (error) throw new Error(error.message);
  }
  refresh();
}

/** Back to the default content/state of the block. */
export async function resetCmsBlock(scope: CmsScope, key: string) {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.from("cms_blocks").delete().eq("scope", scope).eq("block_key", key);
  if (error) throw new Error(error.message);
  refresh();
}

/** Upload an image/video poster to the public bucket and return its URL. */
export async function uploadCmsAsset(formData: FormData): Promise<{ url?: string; error?: string }> {
  try {
    await requireStaff();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
    if (!file.type.startsWith("image/")) return { error: "Only image files can be uploaded." };
    const service = createServiceRoleClient();
    const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `site/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await service.storage.from("tdp-images").upload(path, file, { contentType: file.type });
    if (error) return { error: error.message };
    return { url: service.storage.from("tdp-images").getPublicUrl(path).data.publicUrl };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Upload failed." };
  }
}
