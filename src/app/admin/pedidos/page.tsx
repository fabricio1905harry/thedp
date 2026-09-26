import { createClient } from "@/lib/supabase/server";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";

async function getOrders() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("orders")
      .select("id, status, currency, total, shipping_cost, duties_estimate, created_at")
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
        Depende do checkout Stripe (task #9, bloqueada) e da cotação DHL
        (task #8, bloqueada) para existir pedido pago de fato.
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
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Frete</th>
              <th className="py-2 pr-4">Impostos</th>
              <th className="py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-border">
                <td className="py-2 pr-4">{ORDER_STATUS_LABELS[o.status] ?? o.status}</td>
                <td className="py-2 pr-4">{o.shipping_cost}</td>
                <td className="py-2 pr-4">{o.duties_estimate}</td>
                <td className="py-2">
                  {o.total} {o.currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
