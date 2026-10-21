import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { calculateShipmentPackages } from "@/lib/dhl-packaging";
import { DhlShipmentReviewPanel } from "@/components/dhl-shipment-review-panel";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { CHANNEL_LABELS } from "@/lib/payments";
import {
  OrderManagementPanel,
  type MethodAvailability,
  type OrderEventRow,
  type OrderItemRow,
  type OrderSummary,
  type PaymentRow,
} from "@/components/order-management-panel";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, channel, currency, subtotal, shipping_cost, duties_estimate, total, incoterm, created_at, payment_mode, reserve_amount, reserve_pct_of_sale, stock_hold_type, stock_hold_until, freight_amount, insurance_amount, fuel_surcharge_amount, demand_surcharge_amount, export_declaration_amount, other_dhl_amount, duties_taxes_amount, other_charges_amount, delivery_days, charges_note, charges_informed_at, quote_snapshot, original_subtotal, customer_id"
    )
    .eq("id", id)
    .maybeSingle();

  if (orderError) {
    // Show the real problem instead of a misleading 404 (e.g. a migration not applied yet).
    return (
      <div className="max-w-3xl space-y-3">
        <Link href="/admin/pedidos" className="text-xs text-muted hover:text-accent">← Pedidos</Link>
        <h1 className="font-serif text-2xl">Não foi possível abrir o pedido</h1>
        <p className="text-sm">O banco respondeu com erro ao carregar este pedido:</p>
        <pre className="text-xs bg-surface border border-border p-3 whitespace-pre-wrap">{orderError.message}</pre>
        <p className="text-xs text-muted">Se o erro citar uma coluna inexistente, rode as migrations pendentes (supabase/deploy) no SQL Editor do Supabase.</p>
      </div>
    );
  }
  if (!order) notFound();

  const { data: customerRow } = await supabase
    .from("customers")
    .select("email, name, company_name")
    .eq("id", order.customer_id)
    .maybeSingle();

  const [{ data: items }, { data: payments }, { data: methods }, { data: rules }, { data: feeSetting }, { data: events }] =
    await Promise.all([
      supabase
        .from("order_items")
        .select("id, qty, unit_price, item_status, unavailable_note, product_title, sku, color, size, substitutes_item_id, added_by_tdp, original_qty, original_unit_price")
        .eq("order_id", id)
        .order("id"),
      supabase
        .from("payments")
        .select("id, method_code, kind, status, currency, amount, merchandise_amount, bank_fee_amount, received_amount, cogs_recognized_brl, confirmed_at, created_at, external_ref")
        .eq("order_id", id)
        .order("created_at"),
      supabase.rpc("available_payment_methods", { p_order_id: id }),
      supabase.from("payment_method_rules").select("method_code, enabled").eq("scope", "order").eq("order_id", id),
      supabase.from("app_settings").select("value").eq("key", "bank_processing_fee_brl").maybeSingle(),
      supabase
        .from("order_events")
        .select("id, event_type, summary, created_at, customers!order_events_actor_id_fkey ( email )")
        .eq("order_id", id)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

  const paidMerchandise = (payments ?? [])
    .filter((p) => p.status === "confirmed")
    .reduce((sum, p) => sum + Number(p.merchandise_amount), 0);
  const outstandingMerchandise = Math.max(0, Math.round((Number(order.subtotal) - paidMerchandise) * 100) / 100);

  const activeQty = (items ?? [])
    .filter((i) => i.item_status === "available" || i.item_status === "requested")
    .reduce((sum, i) => sum + Number(i.qty), 0);
  const initialCalculation = await calculateShipmentPackages({
    quantity: activeQty > 0 ? activeQty : 1,
    category: "Dresses",
  });

  const customer = customerRow as { email: string; name: string | null; company_name: string | null } | null;

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <Link href="/admin/pedidos" className="text-xs text-muted hover:text-accent">
          ← Pedidos
        </Link>
        <h1 className="font-serif text-2xl mt-2 mb-1">Pedido {order.order_number ?? `#${order.id.slice(0, 8)}`}</h1>
        <p className="text-xs text-muted">
          Status: <strong className="uppercase">{ORDER_STATUS_LABELS[order.status] ?? order.status}</strong> · Canal:{" "}
          {order.channel ? CHANNEL_LABELS[order.channel] ?? order.channel : "—"} · Cliente:{" "}
          {customer?.company_name || customer?.name || customer?.email || "—"} · Total:{" "}
          <strong>
            {order.total} {order.currency}
          </strong>
        </p>
      </div>

      <OrderManagementPanel
        order={order as unknown as OrderSummary}
        items={(items ?? []) as OrderItemRow[]}
        payments={(payments ?? []) as PaymentRow[]}
        methods={(methods ?? []) as MethodAvailability[]}
        orderRules={Object.fromEntries((rules ?? []).map((r) => [r.method_code, r.enabled]))}
        bankFeeBrl={Number(feeSetting?.value ?? 0)}
        events={(events ?? []) as unknown as OrderEventRow[]}
        outstandingMerchandise={outstandingMerchandise}
      />

      {["paid", "processing", "shipped", "delivered"].includes(order.status) ? (
        <DhlShipmentReviewPanel initialCalculation={initialCalculation} orderId={order.id} />
      ) : (
        <section className="border border-dashed border-border p-4 text-sm text-muted">
          O envio DHL só é gerado depois do pagamento integral do pedido. Status atual: {ORDER_STATUS_LABELS[order.status] ?? order.status}.
        </section>
      )}
    </div>
  );
}
