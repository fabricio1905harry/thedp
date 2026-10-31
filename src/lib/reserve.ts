import type { SupabaseClient } from "@supabase/supabase-js";
import { computeReserve } from "@/lib/payments";

/**
 * Switches an order between the standard payment mode and Reserve for Later
 * Delivery. Reserve amount = product cost + reserve_markup_pct (Admin → Pagamentos,
 * default 10%), shown as the equivalent % of the sale value. Shared by the Admin
 * and by the buyer's "Ship now / Reserve" choice.
 */
export async function applyReserveMode(
  supabase: SupabaseClient,
  orderId: string,
  enabled: boolean,
  opts: { desiredDeliveryDate?: string | null } = {}
): Promise<{ amount: number | null; pctOfSale: number | null }> {
  if (!enabled) {
    const { error } = await supabase
      .from("orders")
      .update({ payment_mode: "standard", reserve_amount: null, reserve_pct_of_sale: null, reserve_desired_delivery_date: null, reserve_balance_due_date: null })
      .eq("id", orderId);
    if (error) throw new Error(error.message);
    return { amount: null, pctOfSale: null };
  }

  const [{ data: order }, { data: items }, { data: setting }] = await Promise.all([
    supabase.from("orders").select("currency, subtotal").eq("id", orderId).single(),
    supabase.from("order_items").select("qty, unit_cost_brl, item_status").eq("order_id", orderId),
    supabase.from("app_settings").select("value").eq("key", "reserve_markup_pct").maybeSingle(),
  ]);
  if (!order) throw new Error("Pedido não encontrado");

  const costBrl = (items ?? [])
    .filter((i) => i.item_status === "available" || i.item_status === "requested")
    .reduce((sum, i) => sum + Number(i.qty) * Number(i.unit_cost_brl ?? 0), 0);

  let brlPerUnit = 1;
  if (order.currency !== "BRL") {
    const { data: rate } = await supabase
      .from("fx_rates")
      .select("rate")
      .eq("base", "BRL")
      .eq("quote", order.currency)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!rate) throw new Error(`Sem taxa de câmbio para ${order.currency}`);
    brlPerUnit = Number(rate.rate);
  }

  const markupPct = Number(setting?.value ?? 10);
  const reserve = computeReserve(costBrl / brlPerUnit, Number(order.subtotal), markupPct);
  const patch: Record<string, unknown> = {
    payment_mode: "reserve",
    reserve_amount: reserve.amount,
    reserve_pct_of_sale: reserve.pctOfSale,
  };
  if (opts.desiredDeliveryDate) patch.reserve_desired_delivery_date = opts.desiredDeliveryDate;
  const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
  if (error) throw new Error(error.message);
  return { amount: reserve.amount, pctOfSale: reserve.pctOfSale };
}
