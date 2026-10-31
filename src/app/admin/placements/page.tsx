import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ENTITY, type EntityKind } from "@/lib/entities";
import { PlacementActions } from "@/components/placement-actions";

export const metadata = { title: "Placements pagos — Admin" };

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");

interface Item {
  kind: string;
  title: string;
  href: string;
  partner: string;
  paid: boolean;
  start: string;
  end: string;
  active: boolean;
  table?: string;
  id?: string;
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export default async function PlacementsPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const items: Item[] = [];

  for (const kind of Object.keys(ENTITY) as EntityKind[]) {
    const cfg = ENTITY[kind];
    const { data } = await supabase.from(cfg.table).select("*");
    for (const r of (data ?? []) as Row[]) {
      if (!r.paid_placement && !r.partner && !r.placement_end) continue;
      const t = kind === "brands" ? s(r.name) : ((r.title as Record<string, string> | null)?.en ?? s(r.slug));
      items.push({
        kind: cfg.singular,
        title: t,
        href: `/admin/${cfg.route}/${s(r.id)}`,
        partner: s(r.partner),
        paid: Boolean(r.paid_placement),
        start: s(r.placement_start),
        end: s(r.placement_end),
        active: Boolean(r.active),
        table: cfg.table,
        id: s(r.id),
      });
    }
  }
  const { data: blocks } = await supabase.from("cms_blocks").select("scope, block_key, active, partner, placement_start, placement_end").not("partner", "is", null);
  for (const b of blocks ?? []) {
    items.push({
      kind: "Bloco da Home",
      title: `${b.scope}/${b.block_key}`,
      href: "/admin/conteudo",
      partner: b.partner ?? "",
      paid: true,
      start: b.placement_start ?? "",
      end: b.placement_end ?? "",
      active: Boolean(b.active),
    });
  }

  const status = (i: Item) => {
    if (i.end && i.end < today) {
      return { label: i.id ? "Destaque encerrado (item continua no site)" : "Expirado (bloco oculto)", cls: "bg-red-100 text-red-900", rank: 0 };
    }
    if (i.end && daysBetween(today, i.end) <= 14) return { label: `Expira em ${daysBetween(today, i.end)} dia(s)`, cls: "bg-amber-100 text-amber-900", rank: 1 };
    if (i.start && i.start > today) return { label: "Agendado", cls: "bg-surface", rank: 2 };
    return { label: "Em vigor", cls: "bg-green-100 text-green-900", rank: 3 };
  };
  const sorted = items
    .map((i) => ({ i, st: status(i) }))
    .sort((a, b) => a.st.rank - b.st.rank || (a.i.end || "9999").localeCompare(b.i.end || "9999"));
  const expiring = sorted.filter((x) => x.st.rank <= 1).length;

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="font-serif text-2xl">Placements pagos</h1>
        <p className="text-sm text-muted mt-1">
          Marcas, coleções, lookbooks, edits e blocos da Home com parceiro/datas. Quando o fim passa, só o destaque pago termina (selo de parceiro e posição de destaque): a marca, coleção, lookbook, edit e seus produtos continuam no site. Lembretes 7 dias, 1 dia e no dia chegam ao Action Center e por e-mail. Blocos da Home com parceiro continuam saindo do ar ao fim do período.
        </p>
        <p className="mt-2 text-sm">
          <span className={`inline-block px-2 py-0.5 text-xs rounded-sm ${expiring ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-900"}`}>
            {expiring ? `${expiring} placement(s) expirado(s) ou expirando em até 14 dias` : "Nenhum placement expirando"}
          </span>
        </p>
      </div>
      <div className="border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="p-2">Tipo</th>
              <th className="p-2">Item</th>
              <th className="p-2">Parceiro</th>
              <th className="p-2">Período</th>
              <th className="p-2">Situação</th>
              <th className="p-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-muted">Nenhum placement cadastrado.</td>
              </tr>
            )}
            {sorted.map(({ i, st }, k) => (
              <tr key={k} className="border-t border-border">
                <td className="p-2">{i.kind}</td>
                <td className="p-2">
                  <Link href={i.href} className="underline">{i.title}</Link>
                  {!i.active && <span className="ml-2 text-xs text-muted">(desligado)</span>}
                </td>
                <td className="p-2">{i.partner || "—"}{i.paid ? "" : " (não pago)"}</td>
                <td className="p-2 whitespace-nowrap">{i.start || "…"} → {i.end || "sem fim"}</td>
                <td className="p-2"><span className={`text-xs px-2 py-0.5 rounded-sm ${st.cls}`}>{st.label}</span></td>
                <td className="p-2">{i.table && i.id ? <PlacementActions table={i.table} id={i.id} /> : <span className="text-xs text-muted">em Conteúdo do site</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
