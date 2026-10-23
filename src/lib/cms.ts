import { createContentReader } from "@/lib/supabase/public";
import { BLOCK_DEFS } from "@/lib/cms-blocks";
import {
  mergeContent,
  resolveContent,
  type BlockDef,
  type CmsScope,
  type OperationCode,
} from "@/lib/cms-types";

export interface CmsRow {
  scope: string;
  block_key: string;
  active: boolean | null;
  sort: number | null;
  operations: string[] | null;
  content: Record<string, unknown> | null;
  partner: string | null;
  placement_start: string | null;
  placement_end: string | null;
}

export interface EffectiveBlock {
  def: BlockDef;
  active: boolean;
  sort: number;
  operations: OperationCode[];
  /** defaults ← overrides; translatable fields still hold EN/ES/PT. */
  content: Record<string, unknown>;
  partner: string | null;
  placementStart: string | null;
  placementEnd: string | null;
  /** Home placement window ended (the block hides itself; nothing else is deactivated). */
  placementExpired: boolean;
  customised: boolean;
}

async function loadRows(scope: CmsScope): Promise<CmsRow[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  try {
    const { client } = await createContentReader();
    const { data, error } = await client
      .from("cms_blocks")
      .select("scope, block_key, active, sort, operations, content, partner, placement_start, placement_end")
      .eq("scope", scope);
    if (error) console.error("[cms] could not read cms_blocks:", error.message);
    return (data ?? []) as CmsRow[];
  } catch (err) {
    console.error("[cms] could not read cms_blocks:", err);
    return [];
  }
}

/** What this deployment sees in the CMS table (used by /api/cms-status and the Admin banner). */
export async function getCmsStatus() {
  try {
    const { client, mode } = await createContentReader();
    const { data, error } = await client.from("cms_blocks").select("scope, block_key, updated_at").neq("block_key", "ui_texts");
    const rows = data ?? [];
    const last = rows.map((r) => r.updated_at as string).sort().at(-1) ?? null;
    return { ok: !error, error: error?.message ?? null, mode, customisedBlocks: rows.length, lastUpdated: last };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "erro", mode: "none" as const, customisedBlocks: 0, lastUpdated: null };
  }
}

/** Every block of a scope with its effective state (defaults ← database), sorted. */
export async function getEffectiveBlocks(scope: CmsScope): Promise<EffectiveBlock[]> {
  const rows = new Map((await loadRows(scope)).map((r) => [r.block_key, r]));
  const today = new Date().toISOString().slice(0, 10);

  return BLOCK_DEFS.filter((d) => d.scope === scope)
    .map((def): EffectiveBlock => {
      const row = rows.get(def.key);
      const expired = Boolean(def.placement && row?.placement_end && row.placement_end < today);
      return {
        def,
        active: row?.active ?? def.defaultActive,
        sort: row?.sort ?? def.defaultSort,
        operations: (row?.operations as OperationCode[] | null) ?? def.defaultOperations,
        content: mergeContent(def.fields, def.defaults, row?.content),
        partner: row?.partner ?? null,
        placementStart: row?.placement_start ?? null,
        placementEnd: row?.placement_end ?? null,
        placementExpired: expired,
        customised: Boolean(row),
      };
    })
    .sort((a, b) => a.sort - b.sort);
}

export interface PublicBlock {
  key: string;
  content: Record<string, unknown>;
}

/** Blocks visible to buyers for an operation, content already in the buyer's language. */
export async function getPublicBlocks(scope: CmsScope, operation: OperationCode, locale: string): Promise<PublicBlock[]> {
  const blocks = await getEffectiveBlocks(scope);
  const today = new Date().toISOString().slice(0, 10);
  return blocks
    .filter((b) => b.active && !b.placementExpired && b.operations.includes(operation))
    .filter((b) => !(b.placementStart && b.placementStart > today))
    .map((b) => ({ key: b.def.key, content: resolveContent(b.def.fields, b.content, locale) }));
}

export async function getPublicBlock(
  scope: CmsScope,
  key: string,
  operation: OperationCode,
  locale: string
): Promise<Record<string, unknown> | null> {
  const blocks = await getPublicBlocks(scope, operation, locale);
  return blocks.find((b) => b.key === key)?.content ?? null;
}
