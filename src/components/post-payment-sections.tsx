import { createClient } from "@/lib/supabase/server";
import { dhlMode } from "@/lib/dhl-adapter";
import { ReserveSchedulePanel } from "@/components/reserve-schedule-panel";
import { ShipmentWorkflowPanel, type PackageDraft, type ShipmentDocView, type ShipmentEventView, type ShipmentView } from "@/components/shipment-workflow-panel";
import { PrepChecklistPanel, type PrepLine } from "@/components/prep-checklist-panel";
import { InvoicePanel } from "@/components/invoice-panel";

interface PackageSuggestion {
  length_cm: number;
  width_cm: number;
  height_cm: number;
  final_weight_kg: number;
}

/**
 * Post-payment sections of the admin order view (stream 4): Reserve
 * schedule, product preparation checklist, DHL shipment workflow and
 * commercial invoice. Server component: loads its own data.
 */
export async function PostPaymentSections({
  orderId,
  status,
  paymentMode,
  currency,
  total,
  suggestedPackages,
}: {
  orderId: string;
  status: string;
  paymentMode: string;
  currency: string;
  total: number;
  suggestedPackages: PackageSuggestion[];
}) {
  const supabase = await createClient();
  const paid = ["paid", "processing", "shipped", "delivered"].includes(status);

  const [{ data: order }, { data: items }, { data: prep }, { data: shipment }, { data: invoice }] = await Promise.all([
    supabase
      .from("orders")
      .select("reserve_stage, reserve_desired_delivery_date, reserve_balance_due_date, reserve_expires_at, reserve_amount")
      .eq("id", orderId)
      .maybeSingle(),
    supabase.from("order_items").select("id, qty, item_status, product_title, color, size").eq("order_id", orderId).order("id"),
    supabase.from("order_prep_items").select("order_item_id, task, done").eq("order_id", orderId),
    supabase
      .from("shipments")
      .select("id, status, dhl_tracking, tracking_url, is_mock, pickup_date, pickup_reference, last_error")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("invoices").select("id, number, issued_at").eq("order_id", orderId).eq("status", "issued").maybeSingle(),
  ]);

  let events: ShipmentEventView[] = [];
  let documents: ShipmentDocView[] = [];
  if (shipment) {
    const [{ data: ev }, { data: docs }] = await Promise.all([
      supabase.from("shipment_events").select("id, status, description, location, occurred_at, source").eq("shipment_id", shipment.id).order("occurred_at", { ascending: false }),
      supabase.from("shipment_documents").select("id, kind, file_name, created_at, visible_to_buyer").eq("shipment_id", shipment.id).order("created_at"),
    ]);
    events = (ev ?? []) as ShipmentEventView[];
    documents = (docs ?? []) as ShipmentDocView[];
  }

  const doneBy = new Map<string, Record<string, boolean>>();
  for (const row of prep ?? []) {
    doneBy.set(row.order_item_id, { ...(doneBy.get(row.order_item_id) ?? {}), [row.task]: row.done });
  }
  const lines: PrepLine[] = (items ?? [])
    .filter((i) => i.item_status === "available" || i.item_status === "requested")
    .map((i) => ({
      id: i.id,
      title: i.product_title ?? "Item",
      detail: `${i.color ?? "—"}/${i.size ?? "—"}`,
      qty: Number(i.qty),
      done: doneBy.get(i.id) ?? {},
    }));

  const packages: PackageDraft[] = (suggestedPackages.length > 0 ? suggestedPackages : [{ length_cm: 40, width_cm: 30, height_cm: 20, final_weight_kg: 2 }]).map((p) => ({
    lengthCm: Number(p.length_cm) || 0,
    widthCm: Number(p.width_cm) || 0,
    heightCm: Number(p.height_cm) || 0,
    weightKg: Number(p.final_weight_kg) || 0,
  }));

  const deposit = Number(order?.reserve_amount ?? 0);
  return (
    <>
      {paymentMode === "reserve" && order && (
        <ReserveSchedulePanel
          orderId={orderId}
          stage={order.reserve_stage}
          desiredDate={order.reserve_desired_delivery_date}
          dueDate={order.reserve_balance_due_date}
          expiresAt={order.reserve_expires_at}
          currency={currency}
          deposit={deposit}
          balance={Math.max(0, Math.round((total - deposit) * 100) / 100)}
        />
      )}
      {paid && <PrepChecklistPanel orderId={orderId} lines={lines} />}
      <ShipmentWorkflowPanel
        orderId={orderId}
        orderPaid={paid}
        mode={dhlMode()}
        shipment={(shipment as ShipmentView | null) ?? null}
        events={events}
        documents={documents}
        initialPackages={packages}
      />
      <InvoicePanel orderId={orderId} canIssue={paid} invoice={invoice} />
    </>
  );
}
