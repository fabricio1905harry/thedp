import Link from "next/link";
import { flattenMessages } from "@/lib/ui-texts";
import { getUiOverrides, clearUiOverridesCache } from "@/lib/ui-texts-server";
import { UiTextRow } from "@/components/ui-text-row";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import pt from "@/messages/pt.json";

const PAGE_SIZE = 40;

export default async function AdminUiTextsPage({ searchParams }: { searchParams: Promise<{ q?: string; ns?: string; page?: string }> }) {
  const { q = "", ns = "", page = "1" } = await searchParams;
  clearUiOverridesCache();
  const overrides = await getUiOverrides();
  const fEn = flattenMessages(en as Record<string, unknown>);
  const fEs = flattenMessages(es as Record<string, unknown>);
  const fPt = flattenMessages(pt as Record<string, unknown>);

  const namespaces = [...new Set(Object.keys(fEn).map((k) => k.split(".")[0]))].sort();
  const needle = q.trim().toLowerCase();
  const keys = Object.keys(fEn).filter((k) => {
    if (ns && k.split(".")[0] !== ns) return false;
    if (!needle) return true;
    return k.toLowerCase().includes(needle) || [fEn[k], fEs[k], fPt[k], ...Object.values(overrides[k] ?? {})].some((t) => t?.toLowerCase().includes(needle));
  });
  const current = Math.max(1, Number(page) || 1);
  const pageKeys = keys.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(keys.length / PAGE_SIZE));
  const href = (p: number) => `/admin/textos?${new URLSearchParams({ ...(q && { q }), ...(ns && { ns }), page: String(p) })}`;

  return (
    <div className="max-w-6xl space-y-5">
      <div>
        <h1 className="font-serif text-2xl mb-1">Textos da interface</h1>
        <p className="text-sm text-muted">
          Edite qualquer texto do site (botões, avisos, menus, formulários) em EN/ES/PT. Deixe vazio para usar o texto padrão. Mantenha os trechos entre {"{chaves}"} exatamente como no original.
        </p>
      </div>
      <form className="flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={q} placeholder="Buscar texto ou chave…" className="border border-border px-3 py-1.5 w-64" />
        <select name="ns" defaultValue={ns} className="border border-border px-3 py-1.5">
          <option value="">Todas as áreas</option>
          {namespaces.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button className="bg-foreground text-background px-4 py-1.5">Filtrar</button>
        <span className="text-xs text-muted self-center">{keys.length} textos · {Object.keys(overrides).length} editados</span>
      </form>
      <div className="space-y-2">
        {pageKeys.map((k) => (
          <UiTextRow key={k} row={{ key: k, base: { en: fEn[k], es: fEs[k] ?? fEn[k], pt: fPt[k] ?? fEn[k] }, override: overrides[k] ?? {} }} />
        ))}
        {pageKeys.length === 0 && <p className="text-sm text-muted">Nenhum texto encontrado.</p>}
      </div>
      <div className="flex gap-3 text-xs items-center">
        {current > 1 && <Link href={href(current - 1)} className="border border-border px-3 py-1.5">← Anterior</Link>}
        <span>Página {current} de {pages}</span>
        {current < pages && <Link href={href(current + 1)} className="border border-border px-3 py-1.5">Próxima →</Link>}
      </div>
    </div>
  );
}
