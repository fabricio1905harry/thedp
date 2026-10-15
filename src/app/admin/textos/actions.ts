"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";
import { flattenMessages, validateOverride, type UiOverrides } from "@/lib/ui-texts";
import { clearUiOverridesCache, getUiOverrides } from "@/lib/ui-texts-server";
import en from "@/messages/en.json";

const LOCALES = ["en", "es", "pt"] as const;

async function load(): Promise<UiOverrides> {
  clearUiOverridesCache();
  return getUiOverrides();
}

async function persist(overrides: UiOverrides, staffId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("cms_blocks").upsert({
    scope: "site",
    block_key: "ui_texts",
    active: true,
    operations: ["intl_b2b", "intl_b2c", "br_b2b", "br_b2c"],
    content: overrides,
    updated_at: new Date().toISOString(),
    updated_by: staffId,
  });
  if (error) throw new Error(error.message);
  clearUiOverridesCache();
  revalidatePath("/", "layout");
  revalidatePath("/admin/textos");
}

export async function saveUiText(key: string, values: { en: string; es: string; pt: string }): Promise<{ error?: string }> {
  const staff = await getCurrentStaff();
  if (!staff) return { error: "Not authorized" };
  const base = flattenMessages(en as Record<string, unknown>)[key];
  if (base === undefined) return { error: "Unknown text." };

  const entry: Partial<Record<(typeof LOCALES)[number], string>> = {};
  for (const l of LOCALES) {
    const v = (values[l] ?? "").trim();
    if (!v) continue;
    const problem = validateOverride(base, v);
    if (problem) return { error: `${l.toUpperCase()}: ${problem}` };
    entry[l] = v.slice(0, 2000);
  }
  const overrides = await load();
  if (Object.keys(entry).length === 0) delete overrides[key];
  else overrides[key] = entry;
  await persist(overrides, staff.id);
  return {};
}

export async function resetUiText(key: string): Promise<{ error?: string }> {
  const staff = await getCurrentStaff();
  if (!staff) return { error: "Not authorized" };
  const overrides = await load();
  delete overrides[key];
  await persist(overrides, staff.id);
  return {};
}
