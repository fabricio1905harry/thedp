import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RESERVE_STAGE_LABELS } from "@/components/reserve-schedule-panel";

interface Row {
  id: string;
  order_number: string | null;
  status: string;
  currency: string;
  total: number;
  reserve_amount: number | null;
  reserve_stage: string | null;
  reserve_desired_delivery_date: string | null;
  reserve_balance_due_date: string | null;
  reserve_expires_at: string | null;
  customers: { email: string; name: string | null; company_name: string | null } | { email: string; name: string | null; company_name: string | null }[] | null;
}

const STAGES = ["reserved", "balance_due", "overdue", "ready_to_ship", "expired", "completed"] as const;

export default async function UpcomingShipmentsPage({ searchParams }: { searchParams: Promise<{ stage?: string; month?: string; q?: string }> }) {
  const { stage, month, q } = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select("id, order_number, status, currency, total, reserve_amount, reserve_stage, reserve_desired_delivery_date, reserve_balance_due_date, reserve_expires_at, customers ( email, name, company_name )")
    .eq("payment_mode", "reserve")
    .not("reserve_stage", "is", null)
    .order("reserve_balance_due_date", { ascending: true, nullsFirst: true })
    .limit(500);
  if (stage) query = query.eq("reserve_stage", stage);
  else query = query.neq("reserve_stage", "completed");
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const start = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    query = query.gte("reserve_balance_due_date", start).lt("reserve_balance_due_date", end);
  }
  if (q) query = query.ilike("order_number", `%${q.replace(/[%,]/g, "")}%`);
  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  const today = new Date().toISOString().slice(0, 10);
  const daysLeft = (d: string | null) => (d ? Math.round((new Date(`${d}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400_000) : null);
  const fmtDate = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR") : "—");
  const link = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ stage, month, q, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return `/admin/envios-futuros${s ? `?${s}` : ""}`;
  };

  return (
    <div className="max-w-6xl space-y-5">
      <div>
        <h1 className="font-serif text-2xl mb-1">Envios futuros</h1>
        <p className="text-sm text-muted">Pedidos Reserve for Later Delivery por vencimento do saldo (UPCOMING SHIPMENTS). Lembretes automáticos 14, 8 e 7 dias antes; janela máxima de 180 dias.</p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs items-center">
        <Link href={link({ stage: "" })} className={`border px-2.5 py-1 ${!stage ? "border-foreground font-semibold" : "border-border"}`}>
          Em aberto
        </Link>
        {STAGES.map((s) => (
          <Link key={s} href={link({ stage: s })} className={`border px-2.5 py-1 ${stage === s ? "border-foreground font-semibold" : "border-border"}`}>
            {RESERVE_STAGE_LABELS[s]}
          </Link>
        ))}
        <form className="flex gap-2 ml-auto" action="/admin/envios-futuros">
          {stage && <input type="hidden" name="stage" value={stage} />}
          <input type="month" name="month" defaultValue={month} className="border border-border px-2 py-1" />
          <input name="q" defaultValue={q} placeholder="Nº do pedido" className="border border-border px-2 py-1 w-32" />
          <button className="border border-border px-2.5 py-1">Filtrar</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nenhum pedido Reserve nesta lista.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr>
                <th className="p-2">Pedido</th>
                <th className="p-2">Cliente</th>
                <th className="p-2">Etapa</th>
                <th className="p-2">Vencimento do saldo</th>
                <th className="p-2">Entrega desejada</th>
                <th className="p-2">Depósito / Total</th>
                <th className="p-2">Janela até</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cust = Array.isArray(r.customers) ? r.customers[0] : r.customers;
                const left = daysLeft(r.reserve_balance_due_date);
                return (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="p-2">
                      <Link href={`/admin/pedidos/${r.id}`} className="underline font-medium">
                        {r.order_number ?? r.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="p-2">{cust?.company_name || cust?.name || cust?.email || "—"}</td>
                    <td className="p-2 font-semibold">{RESERVE_STAGE_LABELS[r.reserve_stage ?? ""] ?? r.reserve_stage}</td>
                    <td className="p-2 whitespace-nowrap">
                      {fmtDate(r.reserve_balance_due_date)}
                      {left !== null && r.reserve_stage !== "ready_to_ship" && r.reserve_stage !== "completed" && (
                        <span className="block text-muted">{left >= 0 ? `em ${left} dia(s)` : `${-left} dia(s) de atraso`}</span>
                      )}
                      {left === null && <span className="block text-muted">sem data — defina no pedido</span>}
                    </td>
                    <td className="p-2 whitespace-nowrap">{fmtDate(r.reserve_desired_delivery_date)}</td>
                    <td className="p-2 whitespace-nowrap">
                      {Number(r.reserve_amount ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} / {Number(r.total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} {r.currency}
                    </td>
                    <td className="p-2 whitespace-nowrap">{r.reserve_expires_at ? new Date(r.reserve_expires_at).toLocaleDateString("pt-BR") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
