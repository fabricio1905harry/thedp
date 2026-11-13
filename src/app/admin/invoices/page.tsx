import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { InvoiceRowActions } from "@/components/invoice-row-actions";

export const metadata = { title: "Invoices — Admin" };

interface InvoiceRow {
  id: string;
  order_id: string;
  year: number;
  number: string;
  status: "issued" | "void";
  currency: string;
  total: number;
  issued_at: string;
  storage_path: string | null;
}

const TZ = "America/Sao_Paulo";
const money = (n: number, currency: string) => `${currency} ${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** All commercial invoices issued so far: search, filter by year / status, open the PDF, regenerate it. */
export default async function AdminInvoicesPage({ searchParams }: { searchParams: Promise<{ q?: string; year?: string; status?: string }> }) {
  const { q = "", year = "", status = "" } = await searchParams;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select("id, order_id, year, number, status, currency, total, issued_at, storage_path")
    .order("issued_at", { ascending: false })
    .limit(1000);
  const all = (data ?? []) as InvoiceRow[];

  const orderIds = [...new Set(all.map((i) => i.order_id))];
  const { data: orders } = orderIds.length
    ? await supabase.from("orders").select("id, order_number, customer_id, status").in("id", orderIds)
    : { data: [] as { id: string; order_number: string | null; customer_id: string; status: string }[] };
  const orderById = new Map((orders ?? []).map((o) => [o.id, o]));
  const customerIds = [...new Set((orders ?? []).map((o) => o.customer_id))];
  const { data: customers } = customerIds.length
    ? await supabase.from("customers").select("id, name, company_name, email").in("id", customerIds)
    : { data: [] as { id: string; name: string | null; company_name: string | null; email: string }[] };
  const customerById = new Map((customers ?? []).map((c) => [c.id, c]));

  const years = [...new Set(all.map((i) => i.year))].sort((a, b) => b - a);
  const needle = q.trim().toLowerCase();
  const rows = all
    .map((inv) => {
      const order = orderById.get(inv.order_id);
      const customer = order ? customerById.get(order.customer_id) : undefined;
      return { inv, order, customer, who: customer?.company_name || customer?.name || customer?.email || "—" };
    })
    .filter(({ inv, order, customer }) => {
      if (year && String(inv.year) !== year) return false;
      if (status && inv.status !== status) return false;
      if (!needle) return true;
      return [inv.number, order?.order_number, customer?.company_name, customer?.name, customer?.email].some((v) => (v ?? "").toLowerCase().includes(needle));
    });

  const totalsByCurrency = new Map<string, number>();
  for (const { inv } of rows) {
    if (inv.status !== "issued") continue;
    totalsByCurrency.set(inv.currency, (totalsByCurrency.get(inv.currency) ?? 0) + Number(inv.total));
  }

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl mb-1">Invoices emitidas</h1>
          <p className="text-sm text-muted">
            Todas as commercial invoices geradas. “Regerar PDF” refaz o arquivo com os dados atuais do pedido e das{" "}
            <Link href="/admin/invoice" className="underline">Configurações da invoice</Link>, mantendo o mesmo número.
          </p>
        </div>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 text-xs">
        <label className="space-y-1">
          <span className="text-muted">Buscar</span>
          <input name="q" defaultValue={q} placeholder="Nº da invoice, pedido ou cliente" className="block w-64 border border-border px-2 py-1.5 text-sm" />
        </label>
        <label className="space-y-1">
          <span className="text-muted">Ano</span>
          <select name="year" defaultValue={year} className="block border border-border px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-muted">Situação</span>
          <select name="status" defaultValue={status} className="block border border-border px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            <option value="issued">Emitidas</option>
            <option value="void">Anuladas</option>
          </select>
        </label>
        <button type="submit" className="bg-foreground text-background px-4 py-2">Filtrar</button>
        {(q || year || status) && (
          <Link href="/admin/invoices" className="underline py-2">Limpar</Link>
        )}
      </form>

      {error && <p className="text-sm text-red-700">{error.message}</p>}

      <p className="text-xs text-muted">
        {rows.length} invoice(s)
        {[...totalsByCurrency.entries()].map(([cur, total]) => (
          <span key={cur}> · total {money(total, cur)}</span>
        ))}
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">{all.length === 0 ? "Nenhuma invoice emitida ainda. Elas são geradas na página do pedido, depois do pagamento." : "Nenhuma invoice com esses filtros."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted uppercase border-b border-border">
                <th className="py-2 pr-4">Invoice</th>
                <th className="py-2 pr-4">Emitida em</th>
                <th className="py-2 pr-4">Pedido</th>
                <th className="py-2 pr-4">Cliente</th>
                <th className="py-2 pr-4 text-right">Total</th>
                <th className="py-2 pr-4">Situação</th>
                <th className="py-2">PDF</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ inv, order, who }) => (
                <tr key={inv.id} className="border-b border-border align-top">
                  <td className="py-2 pr-4 font-medium whitespace-nowrap">{inv.number}</td>
                  <td className="py-2 pr-4 whitespace-nowrap text-muted">{new Date(inv.issued_at).toLocaleDateString("pt-BR", { timeZone: TZ })}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {order ? (
                      <Link href={`/admin/pedidos/${inv.order_id}`} className="underline">{order.order_number ?? inv.order_id.slice(0, 8)}</Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-4">{who}</td>
                  <td className="py-2 pr-4 text-right whitespace-nowrap">{money(inv.total, inv.currency)}</td>
                  <td className="py-2 pr-4">
                    <span className={`text-[11px] px-2 py-0.5 rounded-sm ${inv.status === "issued" ? "bg-emerald-100 text-emerald-900" : "bg-zinc-200 text-zinc-700"}`}>
                      {inv.status === "issued" ? "Emitida" : "Anulada"}
                    </span>
                  </td>
                  <td className="py-2 text-xs">
                    {inv.status === "issued" ? <InvoiceRowActions invoiceId={inv.id} orderId={inv.order_id} hasPdf={Boolean(inv.storage_path)} /> : <span className="text-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
