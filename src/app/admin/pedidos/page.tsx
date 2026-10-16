import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";

async function getOrders() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("orders")
      .select("id, order_number, status, currency, total, shipping_cost, duties_estimate, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  } catch {
    return null;
  }
}

export default async function AdminPedidosPage() {
  const orders = await getOrders();

  return (
    <div>
      <h1 className="font-serif text-2xl mb-2">Pedidos</h1>
      <p className="text-sm text-muted mb-6">
        Order Request → confirmação de estoque → Confirmed Order → pagamento. Clique no pedido para confirmar
        itens, liberar pagamento e registrar pagamentos.
      </p>
      {orders === null ? (
        <p className="text-sm text-muted">
          Banco ainda não provisionado (task #2) — nada para mostrar.
        </p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-muted">Nenhum pedido ainda.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted uppercase border-b border-border">
              <th className="py-2 pr-4">Pedido</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Frete</th>
              <th className="py-2 pr-4">Impostos</th>
              <th className="py-2 pr-4">Total</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-border">
                <td className="py-2 pr-4">
                  <Link href={`/admin/pedidos/${o.id}`} className="underline hover:text-accent">
                    {o.order_number ?? o.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="py-2 pr-4">{ORDER_STATUS_LABELS[o.status] ?? o.status}</td>
                <td className="py-2 pr-4">{o.shipping_cost}</td>
                <td className="py-2 pr-4">{o.duties_estimate}</td>
                <td className="py-2 pr-4">
                  {o.total} {o.currency}
                </td>
                <td className="py-2 text-right">
                  <Link href={`/admin/pedidos/${o.id}`} className="inline-block border border-foreground px-3 py-1 text-[11px] uppercase tracking-wider hover:bg-foreground hover:text-background">
                    Abrir / editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
