import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CHANNEL_LABELS } from "@/lib/payments";
import { LostSaleActions } from "@/components/lost-sale-actions";

interface Row {
  id: string;
  order_id: string;
  variant_id: string | null;
  product_id: string | null;
  product_code: string | null;
  product_title: string | null;
  brand: string | null;
  color: string | null;
  size: string | null;
  quantity: number;
  potential_value: number;
  currency: string;
  channel: string | null;
  status: string;
  restocked_at: string | null;
  created_at: string;
  recovered_units: number;
  recovered_revenue: number;
  customers: { email: string; company_name: string | null; name: string | null } | null;
  orders: { order_number: string | null } | null;
}

const STATUS_LABEL: Record<string, string> = {
  lost: "PERDIDA",
  restock_opportunity: "OPORTUNIDADE DE REPOSIÇÃO",
  contacted: "CONTATADO",
  recovered: "RECUPERADA",
  not_recovered: "NÃO RECUPERADA",
};

const GROUPS = [
  ["product", "Produto"],
  ["brand", "Marca"],
  ["color", "Cor"],
  ["size", "Tamanho"],
  ["variant", "Produto + Cor + Tamanho"],
] as const;

/** Lost Sales — Out of Stock: full list, demand consolidation and ranking. */
export default async function LostSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; variant?: string; group?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("lost_sales")
    .select("*, customers ( email, company_name, name ), orders!lost_sales_order_id_fkey ( order_number )")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.variant) query = query.eq("variant_id", sp.variant);
  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  const group = (GROUPS.some(([k]) => k === sp.group) ? sp.group : "variant") as (typeof GROUPS)[number][0];
  const keyOf = (r: Row) =>
    group === "product"
      ? r.product_title ?? "—"
      : group === "brand"
        ? r.brand ?? "—"
        : group === "color"
          ? r.color ?? "—"
          : group === "size"
            ? r.size ?? "—"
            : `${r.product_title ?? "—"} — ${r.color ?? "—"} / ${r.size ?? "—"}`;

  const agg = new Map<string, { units: number; value: Map<string, number>; buyers: Set<string>; orders: Set<string>; restocks: number; recUnits: number; recRevenue: Map<string, number> }>();
  for (const r of rows) {
    const k = keyOf(r);
    const a = agg.get(k) ?? { units: 0, value: new Map(), buyers: new Set(), orders: new Set(), restocks: 0, recUnits: 0, recRevenue: new Map() };
    a.units += r.quantity;
    a.value.set(r.currency, (a.value.get(r.currency) ?? 0) + Number(r.potential_value));
    a.buyers.add(r.customers?.email ?? "—");
    a.orders.add(r.order_id);
    if (r.restocked_at) a.restocks += 1;
    a.recUnits += r.recovered_units;
    if (r.recovered_revenue) a.recRevenue.set(r.currency, (a.recRevenue.get(r.currency) ?? 0) + Number(r.recovered_revenue));
    agg.set(k, a);
  }
  const ranking = [...agg.entries()].sort((a, b) => b[1].buyers.size - a[1].buyers.size || b[1].units - a[1].units);
  const money = (m: Map<string, number>) =>
    [...m.entries()].map(([c, v]) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} ${c}`).join(" + ") || "—";

  const link = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...next })) if (v) p.set(k, v);
    return `/admin/vendas-perdidas?${p.toString()}`;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl mb-1">Vendas perdidas — Sem estoque</h1>
        <p className="text-sm text-muted max-w-2xl">
          Registradas automaticamente quando uma linha de Order Request é marcada como INDISPONÍVEL — SEM ESTOQUE. Quando uma
          sincronização traz estoque de volta para esse produto + cor + tamanho, ela vira uma OPORTUNIDADE DE REPOSIÇÃO no Action Center.
        </p>
        <div className="flex flex-wrap gap-1 text-xs mt-3">
          <Link href={link({ status: undefined })} className={`border px-2 py-0.5 ${!sp.status ? "border-foreground" : "border-border"}`}>Todas</Link>
          {Object.entries(STATUS_LABEL).map(([k, l]) => (
            <Link key={k} href={link({ status: k })} className={`border px-2 py-0.5 ${sp.status === k ? "border-foreground" : "border-border"}`}>{l}</Link>
          ))}
          {sp.variant && <Link href={link({ variant: undefined })} className="underline ml-2">filtro de variante ✕</Link>}
        </div>
      </div>

      <section>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h2 className="text-sm font-medium uppercase tracking-wide">Mais solicitados sem estoque — por</h2>
          {GROUPS.map(([k, l]) => (
            <Link key={k} href={link({ group: k })} className={`text-xs border px-2 py-0.5 ${group === k ? "border-foreground" : "border-border"}`}>{l}</Link>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[720px]">
            <thead>
              <tr className="text-left text-muted uppercase border-b border-border">
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">Grupo</th>
                <th className="py-1 pr-2 text-right">Unidades perdidas</th>
                <th className="py-1 pr-2 text-right">Valor de vendas perdidas</th>
                <th className="py-1 pr-2 text-right"># Compradores</th>
                <th className="py-1 pr-2 text-right"># Pedidos</th>
                <th className="py-1 pr-2 text-right">Reposições</th>
                <th className="py-1 pr-2 text-right">Unidades recuperadas</th>
                <th className="py-1 text-right">Receita recuperada</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map(([k, a], i) => (
                <tr key={k} className="border-b border-border">
                  <td className="py-1 pr-2">{i + 1}</td>
                  <td className="py-1 pr-2">{k}</td>
                  <td className="py-1 pr-2 text-right">{a.units}</td>
                  <td className="py-1 pr-2 text-right">{money(a.value)}</td>
                  <td className="py-1 pr-2 text-right">{a.buyers.size}</td>
                  <td className="py-1 pr-2 text-right">{a.orders.size}</td>
                  <td className="py-1 pr-2 text-right">{a.restocks}</td>
                  <td className="py-1 pr-2 text-right">{a.recUnits}</td>
                  <td className="py-1 text-right">{money(a.recRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide mb-2">Todas as vendas perdidas — {rows.length}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[900px]">
            <thead>
              <tr className="text-left text-muted uppercase border-b border-border">
                <th className="py-1 pr-2">Data</th>
                <th className="py-1 pr-2">Cliente</th>
                <th className="py-1 pr-2">Produto / Código</th>
                <th className="py-1 pr-2">Marca</th>
                <th className="py-1 pr-2">Cor / Tamanho</th>
                <th className="py-1 pr-2 text-right">Qtd.</th>
                <th className="py-1 pr-2 text-right">Potencial</th>
                <th className="py-1 pr-2">Pedido</th>
                <th className="py-1 pr-2">Canal</th>
                <th className="py-1 pr-2">Status</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border">
                  <td className="py-1 pr-2">{new Date(r.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                  <td className="py-1 pr-2">{r.customers?.company_name || r.customers?.name || r.customers?.email || "—"}</td>
                  <td className="py-1 pr-2">{r.product_title}<span className="block font-mono text-muted">{r.product_code}</span></td>
                  <td className="py-1 pr-2">{r.brand ?? "—"}</td>
                  <td className="py-1 pr-2">{r.color ?? "—"} / {r.size ?? "—"}</td>
                  <td className="py-1 pr-2 text-right">{r.quantity}</td>
                  <td className="py-1 pr-2 text-right">{Number(r.potential_value).toLocaleString("pt-BR")} {r.currency}</td>
                  <td className="py-1 pr-2"><Link href={`/admin/pedidos/${r.order_id}`} className="underline">{r.orders?.order_number ?? r.order_id.slice(0, 8)}</Link></td>
                  <td className="py-1 pr-2">{r.channel ? CHANNEL_LABELS[r.channel] ?? r.channel : "—"}</td>
                  <td className="py-1 pr-2">{STATUS_LABEL[r.status] ?? r.status}</td>
                  <td className="py-1"><LostSaleActions id={r.id} status={r.status} quantity={r.quantity} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
