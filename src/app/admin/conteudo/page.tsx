import Link from "next/link";
import { getEffectiveBlocks } from "@/lib/cms";
import { CMS_SCOPE_LABELS } from "@/lib/cms-blocks";
import type { CmsScope } from "@/lib/cms-types";
import { CmsBlockEditor, type EditorBlock } from "@/components/cms-block-editor";

const SCOPES: CmsScope[] = ["home", "about", "contact"];

/**
 * Site content: every Home module and About/Contact section can be turned
 * ON/OFF, reordered, limited by operation and edited in EN/ES/PT without a
 * developer. Untouched blocks keep their built-in default content.
 */
export default async function AdminContentPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope: scopeParam } = await searchParams;
  const scope = (SCOPES.includes(scopeParam as CmsScope) ? scopeParam : "home") as CmsScope;
  const blocks = await getEffectiveBlocks(scope);

  const editorBlocks: EditorBlock[] = blocks.map((b, i) => ({
    scope,
    key: b.def.key,
    label: b.def.label,
    description: b.def.description,
    fields: b.def.fields,
    content: b.content,
    active: b.active,
    operations: b.operations,
    customised: b.customised,
    placement: Boolean(b.def.placement),
    partner: b.partner ?? "",
    placementStart: b.placementStart ?? "",
    placementEnd: b.placementEnd ?? "",
    isFirst: i === 0,
    isLast: i === blocks.length - 1,
  }));

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="font-serif text-2xl mb-1">Conteúdo do site</h1>
        <p className="text-sm text-muted max-w-2xl">
          Ligue/desligue, reordene e edite os módulos. Texto em inglês é o master; ES e PT podem ser corrigidos à mão.
          Em campos de imagem, cole um link do Google Drive (compartilhado como “qualquer pessoa com o link”) ou envie o arquivo.
        </p>
      </div>

      <div className="flex gap-2 text-xs">
        {SCOPES.map((s) => (
          <Link key={s} href={`/admin/conteudo?scope=${s}`} className={`border px-3 py-1.5 ${s === scope ? "border-foreground font-semibold" : "border-border"}`}>
            {CMS_SCOPE_LABELS[s]}
          </Link>
        ))}
      </div>

      <div className="space-y-2">
        {editorBlocks.map((block) => (
          <CmsBlockEditor key={`${block.scope}-${block.key}-${block.customised}`} block={block} />
        ))}
      </div>
    </div>
  );
}
