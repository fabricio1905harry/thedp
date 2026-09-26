import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";

interface OrderRow {
  id: string;
  status: string;
  currency: string;
  total: number;
  created_at: string;
}

interface PendingCustomerRow {
  id: string;
  email: string;
  created_at: string;
}

interface OverviewData {
  pendingCustomers: number;
  approvedCustomers: number;
  draftProducts: number;
  publishedProducts: number;
  orders: number;
  revenueByCurrency: Record<string, number>;
  dailyCounts: { date: string; count: number }[];
  statusCounts: Record<string, number>;
  recentOrders: OrderRow[];
  pendingCustomersList: PendingCustomerRow[];
}

async function getOverviewData(): Promise<OverviewData | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const supabase = await createClient();
    const now = new Date();
    const since = new Date(now);
    since.setDate(since.getDate() - 29);
    const sinceIso = since.toISOString();

    const [
      pendingCustomersRes,
      approvedCustomersRes,
      draftProductsRes,
      publishedProductsRes,
      ordersRes,
      recentOrdersRes,
      last30dOrdersRes,
      pendingCustomersListRes,
    ] = await Promise.all([
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("status", "approved"),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "draft"),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "published"),
      supabase.from("orders").select("id", { count: "exact", head: true }),
      supabase
        .from("orders")
        .select("id, status, currency, total, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("orders")
        .select("id, status, currency, total, created_at")
        .gte("created_at", sinceIso),
      supabase
        .from("customers")
        .select("id, email, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(5),
    ]);

    const last30d = (last30dOrdersRes.data ?? []) as OrderRow[];

    const revenueByCurrency: Record<string, number> = { BRL: 0, USD: 0 };
    for (const o of last30d) {
      revenueByCurrency[o.currency] = (revenueByCurrency[o.currency] ?? 0) + Number(o.total);
    }

    const dailyCounts: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dailyCounts.push({ date: d.toISOString().slice(0, 10), count: 0 });
    }
    const dailyIndex = new Map(dailyCounts.map((d, idx) => [d.date, idx]));
    for (const o of last30d) {
      const day = o.created_at.slice(0, 10);
      const idx = dailyIndex.get(day);
      if (idx !== undefined) dailyCounts[idx].count += 1;
    }

    const statusCounts: Record<string, number> = {};
    for (const status of Object.keys(ORDER_STATUS_LABELS)) {
      statusCounts[status] = 0;
    }
    for (const o of last30d) {
      if (o.status in statusCounts) statusCounts[o.status] += 1;
    }

    return {
      pendingCustomers: pendingCustomersRes.count ?? 0,
      approvedCustomers: approvedCustomersRes.count ?? 0,
      draftProducts: draftProductsRes.count ?? 0,
      publishedProducts: publishedProductsRes.count ?? 0,
      orders: ordersRes.count ?? 0,
      revenueByCurrency,
      dailyCounts,
      statusCounts,
      recentOrders: (recentOrdersRes.data ?? []) as OrderRow[],
      pendingCustomersList: (pendingCustomersListRes.data ?? []) as PendingCustomerRow[],
    };
  } catch {
    return null;
  }
}

export default async function AdminOverviewPage() {
  const data = await getOverviewData();

  return (
    <div>
      <h1 className="font-serif text-2xl mb-6">Visão geral</h1>
      {!data ? (
        <p className="text-sm text-muted">
          Sem conexão com o banco ainda — os números aparecem assim que o
          Supabase estiver provisionado (task #2) e a migração aplicada
          (task #3).
        </p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Stat label="Cadastros pendentes" value={data.pendingCustomers} />
            <Stat label="Clientes aprovados" value={data.approvedCustomers} />
            <Stat label="Produtos rascunho" value={data.draftProducts} />
            <Stat label="Produtos publicados" value={data.publishedProducts} />
            <Stat label="Pedidos" value={data.orders} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CurrencyCard currency="BRL" amount={data.revenueByCurrency.BRL ?? 0} />
            <CurrencyCard currency="USD" amount={data.revenueByCurrency.USD ?? 0} />
          </div>

          <TrendChart data={data.dailyCounts} />

          <StatusBreakdown counts={data.statusCounts} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PendingCustomersCard customers={data.pendingCustomersList} />
            <RecentOrdersCard orders={data.recentOrders} />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border rounded-sm p-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted mt-1">{label}</p>
    </div>
  );
}

function CurrencyCard({ currency, amount }: { currency: string; amount: number }) {
  const symbol = currency === "BRL" ? "R$" : currency === "USD" ? "US$" : currency;
  return (
    <div className="border border-border rounded-sm p-4">
      <p className="text-2xl font-semibold">
        {symbol} {amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
      <p className="text-xs text-muted mt-1">Faturamento (30 dias) — {currency}</p>
    </div>
  );
}

function TrendChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const width = 600;
  const height = 120;
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const pointY = (count: number) => height - (count / max) * (height - 16) - 8;
  const points = data.map((d, i) => `${i * stepX},${pointY(d.count)}`);
  const firstLabel = data[0]?.date.slice(5).replace("-", "/");
  const lastLabel = data[data.length - 1]?.date.slice(5).replace("-", "/");

  return (
    <div className="border border-border rounded-sm p-4">
      <p className="text-xs text-muted uppercase mb-3">Pedidos por dia — últimos 30 dias</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-28" preserveAspectRatio="none">
        <polyline points={points.join(" ")} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
        {data.map((d, i) => (
          <circle key={d.date} cx={i * stepX} cy={pointY(d.count)} r={d.count > 0 ? 2 : 0} fill="var(--accent)" />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-muted mt-1">
        <span>{firstLabel}</span>
        <span>máx: {max}</span>
        <span>{lastLabel}</span>
      </div>
    </div>
  );
}

function StatusBreakdown({ counts }: { counts: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(counts));
  return (
    <div className="border border-border rounded-sm p-4">
      <p className="text-xs text-muted uppercase mb-3">Pedidos por status (30 dias)</p>
      <div className="space-y-2">
        {Object.entries(ORDER_STATUS_LABELS).map(([status, label]) => {
          const count = counts[status] ?? 0;
          return (
            <div key={status} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 text-muted">{label}</span>
              <div className="flex-1 bg-surface h-2 rounded-full overflow-hidden">
                <div className="bg-accent h-full" style={{ width: `${(count / max) * 100}%` }} />
              </div>
              <span className="w-6 text-right shrink-0">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PendingCustomersCard({ customers }: { customers: PendingCustomerRow[] }) {
  return (
    <div className="border border-border rounded-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted uppercase">Cadastros pendentes</p>
        <Link href="/admin/clientes" className="text-xs text-accent underline">
          Ver todos →
        </Link>
      </div>
      {customers.length === 0 ? (
        <p className="text-xs text-muted">Nenhum cadastro pendente.</p>
      ) : (
        <ul className="space-y-2">
          {customers.map((c) => (
            <li key={c.id} className="flex items-center justify-between text-xs">
              <span className="truncate max-w-[65%]">{c.email}</span>
              <span className="text-muted">{formatShortDate(c.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecentOrdersCard({ orders }: { orders: OrderRow[] }) {
  return (
    <div className="border border-border rounded-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted uppercase">Pedidos recentes</p>
        <Link href="/admin/pedidos" className="text-xs text-accent underline">
          Ver todos →
        </Link>
      </div>
      {orders.length === 0 ? (
        <p className="text-xs text-muted">Nenhum pedido ainda.</p>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/admin/pedidos/${o.id}`}
                className="flex items-center justify-between text-xs hover:text-accent"
              >
                <span>{ORDER_STATUS_LABELS[o.status] ?? o.status}</span>
                <span>
                  {o.total} {o.currency}
                </span>
                <span className="text-muted">{formatShortDate(o.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
