import Link from "next/link";
import {
  Converter,
  KPI_DEFS,
  computeKpis,
  evolutionMonths,
  funnelAndStatus,
  loadDashboardRaw,
  lostSalesSummary,
  outstandingAging,
  parseFilters,
  passThroughBreakdown,
  paymentMix,
  pctChange,
  revenueBreakdowns,
  type DashboardFilters,
  type KpiKey,
} from "@/lib/dashboard";
import { loadActionCenter } from "@/lib/action-center-data";
import { ActionCards } from "@/components/action-cards";
import { ActionQueue } from "@/components/action-queue";
import { CHANNEL_LABELS, PASS_THROUGH_COMPONENTS, PAYMENT_METHOD_LABELS } from "@/lib/payments";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";

type SP = Record<string, string | undefined>;

const PERIODS = [
  ["today", "Hoje"],
  ["7d", "7 dias"],
  ["30d", "30 dias"],
  ["this_month", "Este mês"],
  ["this_year", "Este ano"],
  ["custom", "Personalizado"],
] as const;

const COMPARES = [
  ["previous_period", "Período anterior"],
  ["previous_year", "Mesmo período do ano anterior"],
  ["custom", "Comparação personalizada"],
  ["none", "Sem comparação"],
] as const;

const WINDOWS = [
  ["3m", "Últimos 3 meses"],
  ["6m", "Últimos 6 meses"],
  ["12m", "Últimos 12 meses"],
  ["year", "Ano consolidado"],
] as const;

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return <p className="text-sm text-muted">Sem conexão com o banco ainda.</p>;
  }

  const filters = parseFilters(sp);
  const [raw, actionCenter] = await Promise.all([loadDashboardRaw(), loadActionCenter("system")]);
  const conv = new Converter(raw.rates, filters.currency);

  const current = computeKpis(raw, filters.range, filters.channel, conv);
  const previous = filters.compareRange ? computeKpis(raw, filters.compareRange, filters.channel, conv) : null;
  const months = evolutionMonths(filters.window);
  const evolution = months.map((m) => ({
    label: m.from.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
    value: computeKpis(raw, m, filters.channel, conv)[filters.kpi],
  }));
  const aging = outstandingAging(raw, filters.channel, conv);
  const passThrough = passThroughBreakdown(raw, filters.range, filters.channel, conv);
  const mix = paymentMix(raw, filters.range, filters.channel, conv);
  const breakdowns = revenueBreakdowns(raw, filters.range, filters.channel, conv);
  const { funnel, statusCounts } = funnelAndStatus(raw, filters.range, filters.channel);
  const lost = lostSalesSummary(raw, filters.range, filters.channel, conv);
  const fmt = moneyFormatter(filters.currency);
  const kpiDef = KPI_DEFS.find((k) => k.key === filters.kpi)!;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-2xl">Dashboard</h1>
        {!conv.available && (
          <p className="text-xs text-accent">Sem cotação de câmbio para {filters.currency} — valores exibidos como 0. Atualize o câmbio primeiro.</p>
        )}
      </div>

      <FilterBar filters={filters} sp={sp} />

      {/* ACTION CENTER */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide">Action Center</h2>
          <Link href="/admin/acoes" className="text-xs underline">
            Fila completa ({actionCenter.queue.length}) →
          </Link>
        </div>
        <ActionCards cards={actionCenter.cards} />
        <ActionQueue
          items={actionCenter.queue.slice(0, 10)}
          labels={Object.fromEntries(actionCenter.labels)}
          manualTypes={[...actionCenter.manualTypes]}
          now={actionCenter.now}
        />
      </section>

      {/* KPIs */}
      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide mb-1">KPIs</h2>
        <p className="text-[11px] text-muted mb-3">
          Receita = mercadoria dos pagamentos confirmados no período (sem frete, seguro, cobranças DHL, impostos,
          declaração de exportação ou tarifas bancárias). Valores convertidos para {filters.currency} apenas para análise.
          {previous && ` Comparação: ${rangeLabel(filters.compareRange!)}.`}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {KPI_DEFS.map((k) => (
            <KpiTile
              key={k.key}
              label={k.label}
              value={formatKpi(k.key, current[k.key], fmt)}
              delta={previous ? pctChange(current[k.key], previous[k.key]) : undefined}
              href={hrefWith(sp, { kpi: k.key })}
              selected={k.key === filters.kpi}
            />
          ))}
          <KpiTile label="Valor de pedidos em aberto" value={fmt(aging.total)} />
          <KpiTile label="Valor de pedidos reservados" value={fmt(aging.reservedValue)} />
          <KpiTile label="Pedidos aguardando pagamento" value={String(aging.awaitingPayment)} />
        </div>
      </section>

      {/* EVOLUTION */}
      <section className="border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-medium uppercase tracking-wide">{kpiDef.label} — mês a mês</h2>
          <div className="flex flex-wrap gap-1 text-xs">
            {WINDOWS.map(([key, label]) => (
              <Link key={key} href={hrefWith(sp, { window: key })} className={`border px-2 py-0.5 ${filters.window === key ? "border-foreground font-semibold" : "border-border"}`}>
                {label}
              </Link>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted mb-2">Clique em qualquer KPI acima para exibi-lo no gráfico.</p>
        <MonthlyBars data={evolution} format={(v) => formatKpi(filters.kpi, v, fmt)} />
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        {/* AGING */}
        <section className="border border-border p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide mb-1">Valor de pedidos em aberto — aging</h2>
          <p className="text-2xl font-semibold mb-3">{fmt(aging.total)}</p>
          <div className="space-y-2">
            {aging.buckets.map((b) => (
              <details key={b.key} className="text-xs">
                <summary className="cursor-pointer flex justify-between">
                  <span>{b.label} · {b.orders.length} pedido(s)</span>
                  <span className="font-semibold">{fmt(b.value)}</span>
                </summary>
                <ul className="mt-1 ml-3 space-y-0.5">
                  {b.orders.map((o) => (
                    <li key={o.id}>
                      <Link href={`/admin/pedidos/${o.id}`} className="underline">{o.ref}</Link> — {o.customer} — {fmt(o.value)} ({o.days}d)
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>

        {/* PAYMENT MIX */}
        <section className="border border-border p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide mb-3">Mix de métodos de pagamento</h2>
          {mix.length === 0 ? (
            <p className="text-xs text-muted">Nenhum pagamento confirmado no período.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted border-b border-border">
                  <th className="py-1">Método</th>
                  <th className="py-1 text-right">Transações</th>
                  <th className="py-1 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {mix.map((m) => (
                  <tr key={m.method} className="border-b border-border">
                    <td className="py-1">{PAYMENT_METHOD_LABELS[m.method] ?? m.method}</td>
                    <td className="py-1 text-right">{m.count} ({m.countPct.toFixed(1)}%)</td>
                    <td className="py-1 text-right">{fmt(m.value)} ({m.valuePct.toFixed(1)}%)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* PASS-THROUGH */}
        <section className="border border-border p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide mb-1">Cobranças operacionais recebidas (não são receita)</h2>
          <p className="text-[11px] text-muted mb-3">
            Total recebido {fmt(current.totalCollected)} = Receita {fmt(current.revenue)} + cobranças abaixo. Mantidas à parte
            para comparar depois com os custos reais (ex.: frete cobrado vs custo real DHL).
          </p>
          <table className="w-full text-xs">
            <tbody>
              {PASS_THROUGH_COMPONENTS.map((c) => (
                <tr key={c.key} className="border-b border-border">
                  <td className="py-1">{c.label}</td>
                  <td className="py-1 text-right">{fmt(passThrough[c.key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* LOST SALES */}
        <section className="border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium uppercase tracking-wide">Vendas perdidas — sem estoque</h2>
            <Link href="/admin/vendas-perdidas" className="text-xs underline">Abrir lista →</Link>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Mini label="Valor de vendas perdidas" value={fmt(lost.value)} />
            <Mini label="Unidades perdidas" value={String(lost.units)} />
            <Mini label="Clientes afetados" value={String(lost.customers)} />
            <Mini label="Oportunidades de reposição" value={String(lost.restockOpportunities)} />
            <Mini label="Vendas recuperadas" value={fmt(current.recoveredSales)} />
            <Mini label="Taxa de recuperação" value={lost.recoveryRate === null ? "—" : `${lost.recoveryRate.toFixed(0)}%`} />
          </div>
        </section>

        {/* FUNNEL */}
        <section className="border border-border p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide mb-3">Funil (pedidos criados no período)</h2>
          <HBars
            data={[
              { label: "Order Request", value: funnel.requests },
              { label: "Confirmed Order", value: funnel.confirmed },
              { label: "Pago", value: funnel.paid },
            ]}
            format={(v) => String(v)}
          />
        </section>

        <section className="border border-border p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide mb-3">Pedidos por status</h2>
          <HBars data={statusCounts.map(([s, n]) => ({ label: ORDER_STATUS_LABELS[s] ?? s, value: n }))} format={(v) => String(v)} />
        </section>

        <RankCard title="Vendas por canal" data={breakdowns.byChannel.map((r) => ({ ...r, label: CHANNEL_LABELS[r.label] ?? r.label }))} fmt={fmt} />
        <RankCard title="Vendas por país" data={breakdowns.byCountry} fmt={fmt} />
        <RankCard title="Top produtos" data={breakdowns.topProducts.map((p) => ({ label: `${p.label} (${p.units} pçs)`, value: p.value }))} fmt={fmt} />
        <RankCard title="Top marcas" data={breakdowns.topBrands} fmt={fmt} />
        <RankCard title="Top clientes" data={breakdowns.topCustomers} fmt={fmt} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------

function hrefWith(sp: SP, next: SP) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...next })) if (v) params.set(k, v);
  return `/admin?${params.toString()}`;
}

function rangeLabel(r: { from: Date; to: Date }) {
  const to = new Date(r.to.getTime() - 86400000);
  const f = (d: Date) => d.toLocaleDateString("pt-BR");
  return `${f(r.from)} – ${f(to)}`;
}

function moneyFormatter(currency: string) {
  const nf = new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 0 });
  return (v: number) => nf.format(v);
}

const MONEY_KPIS = new Set(KPI_DEFS.filter((k) => k.money).map((k) => k.key as string));

function formatKpi(key: KpiKey, value: number, fmt: (v: number) => string) {
  if (MONEY_KPIS.has(key)) return fmt(value);
  if (key === "grossMarginPct") return `${value.toFixed(1)}%`;
  if (key === "itemsPerOrder") return value.toFixed(1);
  return Math.round(value).toLocaleString("pt-BR");
}

function FilterBar({ filters, sp }: { filters: DashboardFilters; sp: SP }) {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const lastDay = (d: Date) => iso(new Date(d.getTime() - 86400000));
  return (
    <form method="get" action="/admin" className="flex flex-wrap items-end gap-2 text-xs border border-border p-3">
      <input type="hidden" name="kpi" value={filters.kpi} />
      <input type="hidden" name="window" value={filters.window} />
      <label className="flex flex-col">
        Período
        <select name="period" defaultValue={filters.period} className="border border-border px-2 py-1">
          {PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label className="flex flex-col">
        De
        <input type="date" name="from" defaultValue={sp.from ?? iso(filters.range.from)} className="border border-border px-2 py-1" />
      </label>
      <label className="flex flex-col">
        Até
        <input type="date" name="to" defaultValue={sp.to ?? lastDay(filters.range.to)} className="border border-border px-2 py-1" />
      </label>
      <label className="flex flex-col">
        Comparar com
        <select name="compare" defaultValue={filters.compare} className="border border-border px-2 py-1">
          {COMPARES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label className="flex flex-col">
        Comparar de
        <input type="date" name="cfrom" defaultValue={sp.cfrom} className="border border-border px-2 py-1" />
      </label>
      <label className="flex flex-col">
        Comparar até
        <input type="date" name="cto" defaultValue={sp.cto} className="border border-border px-2 py-1" />
      </label>
      <label className="flex flex-col">
        Canal
        <select name="channel" defaultValue={filters.channel} className="border border-border px-2 py-1">
          <option value="all">Todos os canais</option>
          {Object.entries(CHANNEL_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label className="flex flex-col">
        Exibir em
        <select name="currency" defaultValue={filters.currency} className="border border-border px-2 py-1">
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="BRL">BRL</option>
        </select>
      </label>
      <button type="submit" className="btn-primary px-3 py-1.5">Aplicar</button>
      <p className="w-full text-[11px] text-muted">De/Até valem quando Período = Personalizado; Comparar de/até quando Comparar com = Comparação personalizada.</p>
    </form>
  );
}

function KpiTile({
  label,
  value,
  delta,
  href,
  selected,
}: {
  label: string;
  value: string;
  delta?: number | null;
  href?: string;
  selected?: boolean;
}) {
  const body = (
    <>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[11px] text-muted leading-tight">{label}</p>
      {delta !== undefined && (
        <p className="text-[11px] mt-1">
          {delta === null ? "novo" : `${delta >= 0 ? "▲ +" : "▼ "}${delta.toFixed(1)}%`}{" "}
          <span className="text-muted">vs comparação</span>
        </p>
      )}
    </>
  );
  const cls = `border p-3 block ${selected ? "border-foreground" : "border-border"}`;
  return href ? <Link href={href} className={`${cls} hover:border-foreground`}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border p-2">
      <p className="text-sm font-semibold">{value}</p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  );
}

/** Single-series vertical bars (one per month), native tooltip per bar. */
function MonthlyBars({ data, format }: { data: { label: string; value: number }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  return (
    <div>
      <div className="flex items-end gap-1 h-40 border-b border-border">
        {data.map((d) => (
          <div key={d.label} className="flex-1 h-full flex flex-col justify-end items-center group" title={`${d.label}: ${format(d.value)}`}>
            <span className="text-[10px] text-muted opacity-0 group-hover:opacity-100">{format(d.value)}</span>
            <div className="w-full max-w-10 bg-accent rounded-t" style={{ height: `${(Math.max(0, d.value) / max) * 85}%`, minHeight: d.value > 0 ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-1">
        {data.map((d) => (
          <span key={d.label} className="flex-1 text-center text-[10px] text-muted">{d.label}</span>
        ))}
      </div>
    </div>
  );
}

function HBars({ data, format }: { data: { label: string; value: number }[]; format: (v: number) => string }) {
  if (data.length === 0) return <p className="text-xs text-muted">Sem dados no período.</p>;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-1.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2 text-xs" title={`${d.label}: ${format(d.value)}`}>
          <span className="w-40 shrink-0 truncate text-muted">{d.label}</span>
          <div className="flex-1 h-2">
            <div className="bg-accent h-full rounded-r" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <span className="w-24 text-right shrink-0">{format(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

function RankCard({ title, data, fmt }: { title: string; data: { label: string; value: number }[]; fmt: (v: number) => string }) {
  return (
    <section className="border border-border p-4">
      <h2 className="text-sm font-medium uppercase tracking-wide mb-3">{title}</h2>
      <HBars data={data} format={fmt} />
    </section>
  );
}
