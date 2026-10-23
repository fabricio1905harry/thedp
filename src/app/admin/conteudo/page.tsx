import Link from "next/link";
import { getCmsStatus, getEffectiveBlocks } from "@/lib/cms";
import { CMS_SCOPE_LABELS } from "@/lib/cms-blocks";
import type { CmsScope } from "@/lib/cms-types";
import { CmsBlockEditor, type EditorBlock } from "@/components/cms-block-editor";

const SCOPES: CmsScope[] = ["home", "about", "contact", "site", "pages"];

/**
 * Site content: every Home module and About/Contact section can be turned
 * ON/OFF, reordered, limited by operation and edited in EN/ES/PT without a
 * developer. Untouched blocks keep their built-in default content.
 */
interface SiteStatus {
  ok: boolean;
  mode?: string;
  customisedBlocks?: number;
  lastUpdated?: string | null;
  error?: string | null;
}

async function checkSite(): Promise<{ state: "unset" | "unreachable" | "ok"; status?: SiteStatus; url?: string }> {
  const url = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!url) return { state: "unset" };
  try {
    const res = await fetch(`${url}/api/cms-status`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { state: "unreachable", url };
    return { state: "ok", status: (await res.json()) as SiteStatus, url };
  } catch {
    return { state: "unreachable", url };
  }
}

export default async function AdminContentPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope: scopeParam } = await searchParams;
  const scope = (SCOPES.includes(scopeParam as CmsScope) ? scopeParam : "home") as CmsScope;
  const blocks = await getEffectiveBlocks(scope);
  const [site, own] = await Promise.all([checkSite(), getCmsStatus()]);
  const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");
  const siteSeesAll = site.state === "ok" && site.status?.ok && (site.status.customisedBlocks ?? 0) >= own.customisedBlocks;

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

      <div className={`rounded-xl border px-4 py-3 text-sm ${siteSeesAll ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
        {site.state === "unset" && (
          <p>
            Para conferir se o site está lendo estas alterações, defina <code>NEXT_PUBLIC_SITE_URL</code> (endereço do site) na Vercel do painel.
          </p>
        )}
        {site.state === "unreachable" && <p>Não consegui falar com o site ({site.url}) para conferir. Confira se o endereço está certo e se o site foi publicado.</p>}
        {site.state === "ok" && siteSeesAll && (
          <p>
            ✔ O site está lendo o conteúdo ({site.status?.customisedBlocks} bloco(s) personalizado(s); último ajuste em {fmt(site.status?.lastUpdated)}). Alterações aparecem ao recarregar a página do site.
          </p>
        )}
        {site.state === "ok" && !siteSeesAll && (
          <p>
            ⚠ O site vê {site.status?.customisedBlocks ?? 0} de {own.customisedBlocks} bloco(s) personalizado(s){site.status?.error ? ` (erro: ${site.status.error})` : ""}. Rode a migration 0080 no Supabase
            e confira as variáveis do projeto do site (<code>NEXT_PUBLIC_SUPABASE_URL</code> e a chave pública). Modo de leitura do site: {site.status?.mode ?? "?"}.
          </p>
        )}
        {site.url && (
          <p className="mt-1 text-xs">
            Ver no site:{" "}
            <a className="underline" href={`${site.url}/pt`} target="_blank" rel="noreferrer">Home</a> ·{" "}
            <a className="underline" href={`${site.url}/pt/sobre`} target="_blank" rel="noreferrer">Sobre</a> ·{" "}
            <a className="underline" href={`${site.url}/pt/contato`} target="_blank" rel="noreferrer">Contato</a> ·{" "}
            <a className="underline" href={`${site.url}/pt/faq`} target="_blank" rel="noreferrer">FAQ</a>
          </p>
        )}
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
