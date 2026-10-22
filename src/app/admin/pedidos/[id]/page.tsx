import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { calculateShipmentPackages } from "@/lib/dhl-packaging";
import { DhlShipmentReviewPanel } from "@/components/dhl-shipment-review-panel";
import { StatusBadge } from "@/components/status-badge";
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

  const ORDER_COLUMNS =
    "id, order_number, status, channel, currency, subtotal, shipping_cost, duties_estimate, total, incoterm, created_at, payment_mode, reserve_amount, reserve_pct_of_sale, stock_hold_type, stock_hold_until, freight_amount, insurance_amount, fuel_surcharge_amount, demand_surcharge_amount, export_declaration_amount, other_dhl_amount, duties_taxes_amount, other_charges_amount, delivery_days, charges_note, charges_informed_at, quote_snapshot, original_subtotal, customer_id, canceled_at, cancel_reason, canceled_by_buyer";

  // Everything is requested at once (one round trip instead of several in a row).
  const [orderRes, itemsRes, paymentsRes, methodsRes, rulesRes, feeRes, eventsRes] = await Promise.all([
    supabase
      .from("orders")
      .select(`${ORDER_COLUMNS}, customer:customers!orders_customer_id_fkey ( email, name, company_name )`)
      .eq("id", id)
      .maybeSingle(),
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

  type OrderRow = {
    id: string;
    order_number: string | null;
    status: string;
    channel: string | null;
    currency: string;
    subtotal: number;
    total: number;
    customer_id: string;
    canceled_at?: string | null;
    cancel_reason?: string | null;
    canceled_by_buyer?: boolean | null;
  };
  let order = orderRes.data as unknown as OrderRow | null;
  let customerRow = (orderRes.data as { customer?: unknown } | null)?.customer as
    | { email: string; name: string | null; company_name: string | null }
    | null
    | undefined;
  let orderError = orderRes.error;

  if (orderError) {
    // Fallback if the customer relation name differs in this database.
    const plain = await supabase.from("orders").select(ORDER_COLUMNS).eq("id", id).maybeSingle();
    if (!plain.error) {
      orderError = null;
      order = plain.data as typeof order;
      const c = order
        ? await supabase.from("customers").select("email, name, company_name").eq("id", order.customer_id).maybeSingle()
        : null;
      customerRow = c?.data ?? null;
    }
  }

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

  const items = itemsRes.data;
  const payments = paymentsRes.data;
  const methods = methodsRes.data;
  const rules = rulesRes.data;
  const feeSetting = feeRes.data;
  const events = eventsRes.data;

  const paidMerchandise = (payments ?? [])
    .filter((p) => p.status === "confirmed")
    .reduce((sum, p) => sum + Number(p.merchandise_amount), 0);
  const outstandingMerchandise = Math.max(0, Math.round((Number(order.subtotal) - paidMerchandise) * 100) / 100);

  const activeQty = (items ?? [])
    .filter((i) => i.item_status === "available" || i.item_status === "requested")
    .reduce((sum, i) => sum + Number(i.qty), 0);
  const showDhl = ["paid", "processing", "shipped", "delivered"].includes(order.status);
  const initialCalculation = showDhl
    ? await calculateShipmentPackages({ quantity: activeQty > 0 ? activeQty : 1, category: "Dresses" })
    : null;

  const customer = (customerRow ?? null) as { email: string; name: string | null; company_name: string | null } | null;

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="space-y-3">
        <Link href="/admin/pedidos" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1">
          ← Voltar aos pedidos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-3xl">Pedido {order.order_number ?? `#${order.id.slice(0, 8)}`}</h1>
          <StatusBadge status={order.status} label={ORDER_STATUS_LABELS[order.status] ?? order.status} />
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="rounded-xl border border-border bg-white px-4 py-3">
            <dt className="text-[11px] text-muted">Cliente</dt>
            <dd className="font-medium truncate">{customer?.company_name || customer?.name || customer?.email || "—"}</dd>
          </div>
          <div className="rounded-xl border border-border bg-white px-4 py-3">
            <dt className="text-[11px] text-muted">Canal</dt>
            <dd className="font-medium">{order.channel ? CHANNEL_LABELS[order.channel] ?? order.channel : "—"}</dd>
          </div>
          <div className="rounded-xl border border-border bg-white px-4 py-3">
            <dt className="text-[11px] text-muted">Itens</dt>
            <dd className="font-medium">{activeQty} peça(s)</dd>
          </div>
          <div className="rounded-xl border border-border bg-white px-4 py-3">
            <dt className="text-[11px] text-muted">Total</dt>
            <dd className="font-semibold">
              {Number(order.total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} {order.currency}
            </dd>
          </div>
        </dl>
      </div>

      {order.status === "canceled" && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-900 p-4 text-sm space-y-1">
          <p className="font-semibold">
            Pedido cancelado{order.canceled_by_buyer ? " pelo comprador" : ""}
            {order.canceled_at ? ` em ${new Date(order.canceled_at).toLocaleString("pt-BR")}` : ""}
          </p>
          {order.cancel_reason && <p>Motivo: {order.cancel_reason}</p>}
          <p className="text-xs">Nenhum pagamento foi recebido enquanto o pedido estava em solicitação.</p>
        </div>
      )}

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

      {showDhl && initialCalculation ? (
        <DhlShipmentReviewPanel initialCalculation={initialCalculation} orderId={order.id} />
      ) : (
        <section className="border border-dashed border-border p-4 text-sm text-muted">
          O envio DHL só é gerado depois do pagamento integral do pedido. Status atual: {ORDER_STATUS_LABELS[order.status] ?? order.status}.
        </section>
      )}
    </div>
  );
}
