import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { calculateShipmentPackages } from "@/lib/dhl-packaging";
import { DhlShipmentReviewPanel } from "@/components/dhl-shipment-review-panel";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServiceRoleClient();

  const { data: order } = await supabase
    .from("orders")
    .select(`
      id, status, currency, subtotal, shipping_cost, duties_estimate, total, incoterm, created_at,
      order_items ( id, quantity, price )
    `)
    .eq("id", id)
    .maybeSingle();

  if (!order) {
    // If order not found, display demo calculation with 17 dresses for testing
    const demoCalculation = await calculateShipmentPackages({
      quantity: 17,
      category: "Dresses",
    });

    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-serif text-2xl mb-1">Pedido Demo / Simulação DHL</h1>
          <p className="text-xs text-muted">ID: {id}</p>
        </div>

        <DhlShipmentReviewPanel initialCalculation={demoCalculation} orderId={id} />
      </div>
    );
  }

  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const totalQty = items.reduce((sum: number, item: any) => sum + (item.quantity ?? 0), 0);

  const initialCalculation = await calculateShipmentPackages({
    quantity: totalQty > 0 ? totalQty : 1,
    category: "Dresses",
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-serif text-2xl mb-1">Detalhes do Pedido #{order.id.slice(0, 8)}</h1>
        <p className="text-xs text-muted">
          Status: <strong className="uppercase">{ORDER_STATUS_LABELS[order.status] ?? order.status}</strong> · Total:{" "}
          <strong>
            {order.total} {order.currency}
          </strong>
        </p>
      </div>

      <DhlShipmentReviewPanel initialCalculation={initialCalculation} orderId={order.id} />
    </div>
  );
}
