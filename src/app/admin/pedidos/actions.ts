"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";
import { EDITABLE_ORDER_STATUSES } from "@/lib/order-status";
import { computeReserve } from "@/lib/payments";

async function requireStaff() {
  const staff = await getCurrentStaff();
  if (!staff) throw new Error("Not authorized");
  return staff;
}

function revalidateOrder(orderId: string) {
  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin");
}

/** Order change history (order_events). Never blocks the action itself. */
async function logEvent(
  orderId: string,
  actorId: string,
  eventType: string,
  summary: string,
  details?: Record<string, unknown>
) {
  try {
    const supabase = await createClient();
    await supabase
      .from("order_events")
      .insert({ order_id: orderId, actor_id: actorId, event_type: eventType, summary, details: details ?? null });
  } catch {
    // history is best-effort
  }
}

async function itemLabel(orderId: string, itemId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("order_items")
    .select("product_title, color, size, qty, unit_price, item_status, original_qty, original_unit_price")
    .eq("id", itemId)
    .eq("order_id", orderId)
    .single();
  if (!data) throw new Error("Order line not found");
  return {
    ...data,
    label: `${data.product_title ?? "Item"} ${data.color ?? "—"}/${data.size ?? "—"}`,
  };
}

async function assertEditable(orderId: string) {
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("status").eq("id", orderId).single();
  if (!order) throw new Error("Order not found");
  if (!EDITABLE_ORDER_STATUSES.includes(order.status)) {
    throw new Error("This order can no longer be changed (already released for payment / paid).");
  }
  return supabase;
}

/**
 * Subtotal = lines still in the order (available/requested). Freight,
 * duties and total are derived by the orders_compute_charges trigger.
 */
async function recalcTotals(orderId: string) {
  const supabase = await createClient();
  const { data: items } = await supabase.from("order_items").select("qty, unit_price, item_status").eq("order_id", orderId);
  const subtotal = (items ?? [])
    .filter((i) => i.item_status === "available" || i.item_status === "requested")
    .reduce((sum, i) => sum + Number(i.qty) * Number(i.unit_price), 0);
  await supabase.from("orders").update({ subtotal: Math.round(subtotal * 100) / 100 }).eq("id", orderId);
}

export interface OrderChargesInput {
  freightAmount: number;
  insuranceAmount: number;
  fuelSurchargeAmount: number;
  demandSurchargeAmount: number;
  exportDeclarationAmount: number;
  otherDhlAmount: number;
  dutiesTaxesAmount: number;
  otherChargesAmount: number;
  deliveryDays: number | null;
  note: string;
}

/**
 * Freight & import duties informed by the TDP after stock confirmation
 * (in the order currency). Closes "DHL Quote Required" in the Action
 * Center; required before generating the Confirmed Order.
 */
export async function setOrderCharges(orderId: string, input: OrderChargesInput) {
  const staff = await requireStaff();
  const supabase = await assertEditable(orderId);
  const n = (v: number) => {
    const x = Number(v);
    if (!Number.isFinite(x) || x < 0) throw new Error("Values must be zero or positive.");
    return Math.round(x * 100) / 100;
  };
  const { error } = await supabase
    .from("orders")
    .update({
      freight_amount: n(input.freightAmount),
      insurance_amount: n(input.insuranceAmount),
      fuel_surcharge_amount: n(input.fuelSurchargeAmount),
      demand_surcharge_amount: n(input.demandSurchargeAmount),
      export_declaration_amount: n(input.exportDeclarationAmount),
      other_dhl_amount: n(input.otherDhlAmount),
      duties_taxes_amount: n(input.dutiesTaxesAmount),
      other_charges_amount: n(input.otherChargesAmount),
      delivery_days: input.deliveryDays && input.deliveryDays > 0 ? Math.round(input.deliveryDays) : null,
      charges_note: input.note.trim() || null,
      charges_informed_at: new Date().toISOString(),
      charges_informed_by: staff.id,
    })
    .eq("id", orderId);
  if (error) throw new Error(error.message);
  await logEvent(orderId, staff.id, "charges", "Freight & import duties informed", { ...input });
  revalidateOrder(orderId);
}

export type ItemStatus =
  | "requested"
  | "available"
  | "unavailable_out_of_stock"
  | "unavailable_order_only"
  | "removed";

/**
 * Per-line confirmation. OUT OF STOCK also makes the variant unavailable in
 * the catalog and records a LOST SALE (DB trigger); ORDER ONLY / OTHER
 * REASON affects this order only. Setting a line back from OUT OF STOCK
 * removes its untouched lost sale.
 */
export async function setOrderItemStatus(orderId: string, itemId: string, status: ItemStatus, note?: string) {
  const staff = await requireStaff();
  const supabase = await assertEditable(orderId);
  const before = await itemLabel(orderId, itemId);
  const { error } = await supabase
    .from("order_items")
    .update({ item_status: status, unavailable_note: note || null, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("order_id", orderId);
  if (error) throw new Error(error.message);
  await recalcTotals(orderId);
  await logEvent(orderId, staff.id, "item_status", `${before.label}: ${before.item_status} → ${status}`, {
    item_id: itemId,
    from: before.item_status,
    to: status,
    note: note || null,
  });
  revalidateOrder(orderId);
}

export async function setOrderItemQty(orderId: string, itemId: string, qty: number) {
  const staff = await requireStaff();
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("Quantity must be a positive integer.");
  const supabase = await assertEditable(orderId);
  const before = await itemLabel(orderId, itemId);
  const { error } = await supabase
    .from("order_items")
    .update({ qty, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("order_id", orderId);
  if (error) throw new Error(error.message);
  await recalcTotals(orderId);
  await logEvent(orderId, staff.id, "item_qty", `${before.label}: qty ${before.qty} → ${qty}`, {
    item_id: itemId,
    from: before.qty,
    to: qty,
  });
  revalidateOrder(orderId);
}

/** Unit price of one line, in the order currency (the buyer's original price is kept). */
export async function setOrderItemPrice(orderId: string, itemId: string, unitPrice: number) {
  const staff = await requireStaff();
  const price = Math.round(Number(unitPrice) * 100) / 100;
  if (!Number.isFinite(price) || price < 0) throw new Error("Price must be zero or positive.");
  const supabase = await assertEditable(orderId);
  const before = await itemLabel(orderId, itemId);
  const { error } = await supabase
    .from("order_items")
    .update({ unit_price: price, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("order_id", orderId);
  if (error) throw new Error(error.message);
  await recalcTotals(orderId);
  await logEvent(orderId, staff.id, "item_price", `${before.label}: unit price ${before.unit_price} → ${price}`, {
    item_id: itemId,
    from: Number(before.unit_price),
    to: price,
  });
  revalidateOrder(orderId);
}

/** Puts a line back exactly as the buyer requested it (qty, price, status). */
export async function restoreOrderItem(orderId: string, itemId: string) {
  const staff = await requireStaff();
  const supabase = await assertEditable(orderId);
  const before = await itemLabel(orderId, itemId);
  if (before.original_qty === null || before.original_unit_price === null) {
    throw new Error("This line was added by the TDP — set it as removed instead.");
  }
  const { error } = await supabase
    .from("order_items")
    .update({
      qty: before.original_qty,
      unit_price: before.original_unit_price,
      item_status: "requested",
      unavailable_note: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("order_id", orderId);
  if (error) throw new Error(error.message);
  await recalcTotals(orderId);
  await logEvent(orderId, staff.id, "item_restore", `${before.label}: restored to the original request`, {
    item_id: itemId,
  });
  revalidateOrder(orderId);
}

export interface VariantSearchResult {
  sku: string;
  title: string;
  color: string | null;
  size: string | null;
  stock: number;
  price: number | null;
}

/** Product/SKU search to add or substitute a line (price in the order currency). */
export async function searchVariantsForOrder(orderId: string, query: string): Promise<VariantSearchResult[]> {
  await requireStaff();
  const q = query.replace(/[%,()*\\]/g, " ").trim();
  if (q.length < 2) return [];
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("currency").eq("id", orderId).single();
  const currency = (order?.currency ?? "USD").toUpperCase();

  const select = "id, sku, color, size, stock, products!inner ( title, price_brl, price_usd, price_eur )";
  const [bySku, byTitle] = await Promise.all([
    supabase.from("variants").select(select).ilike("sku", `%${q}%`).limit(20),
    supabase.from("variants").select(select).ilike("products.title", `%${q}%`).limit(20),
  ]);

  const seen = new Set<string>();
  const results: VariantSearchResult[] = [];
  for (const row of [...(bySku.data ?? []), ...(byTitle.data ?? [])] as unknown as {
    id: string;
    sku: string;
    color: string | null;
    size: string | null;
    stock: number;
    products: { title: string; price_brl: number | null; price_usd: number | null; price_eur: number | null };
  }[]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const p = row.products;
    const price = currency === "BRL" ? p.price_brl : currency === "EUR" ? p.price_eur : p.price_usd;
    results.push({ sku: row.sku, title: p.title, color: row.color, size: row.size, stock: row.stock, price });
  }
  return results.slice(0, 20);
}

/**
 * Add a product (by SKU = product + color + size) to the order, optionally
 * as a substitute for another line (that line is marked removed unless it
 * already has an unavailable status). `unitPrice` overrides the list price.
 */
export async function addOrderItemBySku(
  orderId: string,
  sku: string,
  qty: number,
  substitutesItemId?: string,
  unitPrice?: number
) {
  const staff = await requireStaff();
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("Quantity must be a positive integer.");
  const supabase = await assertEditable(orderId);

  const [{ data: variant }, { data: order }] = await Promise.all([
    supabase
      .from("variants")
      .select("id, stock, products ( price_brl, price_usd, price_eur )")
      .eq("sku", sku.trim())
      .maybeSingle(),
    supabase.from("orders").select("currency").eq("id", orderId).single(),
  ]);
  if (!variant) throw new Error(`SKU not found: ${sku}`);

  const prices = variant.products as unknown as { price_brl: number | null; price_usd: number | null; price_eur: number | null } | null;
  const currency = (order?.currency ?? "USD").toUpperCase();
  const listPrice =
    currency === "BRL" ? prices?.price_brl : currency === "EUR" ? prices?.price_eur : prices?.price_usd;
  const price = unitPrice !== undefined && Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : listPrice;
  if (price === null || price === undefined) throw new Error(`No ${currency} price for ${sku} — type a unit price.`);

  const { error } = await supabase.from("order_items").insert({
    order_id: orderId,
    variant_id: variant.id,
    qty,
    unit_price: price,
    item_status: "available",
    added_by_tdp: true,
    substitutes_item_id: substitutesItemId ?? null,
  });
  if (error) throw new Error(error.message);

  let replaced = "";
  if (substitutesItemId) {
    const original = await itemLabel(orderId, substitutesItemId);
    replaced = ` (substitutes ${original.label})`;
    if (original.item_status === "requested" || original.item_status === "available") {
      await supabase.from("order_items").update({ item_status: "removed" }).eq("id", substitutesItemId);
    }
  }

  await recalcTotals(orderId);
  await logEvent(orderId, staff.id, "item_added", `Added ${qty} × ${sku} at ${price}${replaced}`, {
    sku,
    qty,
    unit_price: price,
    substitutes_item_id: substitutesItemId ?? null,
  });
  revalidateOrder(orderId);
}

export async function setOrderStage(
  orderId: string,
  status: "order_request" | "stock_confirmation" | "awaiting_buyer_decision" | "canceled"
) {
  const staff = await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
  if (error) throw new Error(error.message);
  await logEvent(orderId, staff.id, "status", `Status → ${status}`, { status });
  revalidateOrder(orderId);
}

/**
 * Takes a released Confirmed Order back to editing (stock confirmation) so
 * lines, prices and freight/duties can be changed again. Not allowed once a
 * payment exists (pending or confirmed) — cancel or refund it first.
 */
export async function reopenOrderForEditing(orderId: string) {
  const staff = await requireStaff();
  const supabase = await createClient();
  const [{ data: order }, { data: payments }] = await Promise.all([
    supabase.from("orders").select("status").eq("id", orderId).single(),
    supabase.from("payments").select("id, status").eq("order_id", orderId),
  ]);
  if (!order) throw new Error("Order not found");
  if (!["confirmed_awaiting_payment", "payment_coordination_required", "payment_window_expired"].includes(order.status)) {
    throw new Error("Only a Confirmed Order waiting for payment can be reopened for editing.");
  }
  if ((payments ?? []).some((p) => p.status === "pending_verification" || p.status === "confirmed")) {
    throw new Error("This order already has a payment — reject or refund it before editing.");
  }
  const { error } = await supabase
    .from("orders")
    .update({
      status: "stock_confirmation",
      payment_released_at: null,
      stock_hold_type: null,
      stock_hold_until: null,
      payment_window_expired_at: null,
    })
    .eq("id", orderId);
  if (error) throw new Error(error.message);
  await logEvent(orderId, staff.id, "reopened", "Confirmed Order reopened for editing");
  revalidateOrder(orderId);
}

/**
 * Generate the Confirmed Order and open payment with the Temporary Stock
 * Hold (24h / 48h / custom from now) — or Cannot Reserve, which keeps
 * payment disabled and raises PAYMENT COORDINATION REQUIRED. Also used to
 * reopen an expired order after re-confirming stock and values.
 */
export async function releaseOrderForPayment(
  orderId: string,
  holdType: "24h" | "48h" | "custom" | "cannot_reserve",
  customUntil?: string
) {
  const staff = await requireStaff();
  const supabase = await createClient();

  const [{ data: items }, { data: order }] = await Promise.all([
    supabase.from("order_items").select("item_status").eq("order_id", orderId),
    supabase.from("orders").select("charges_informed_at").eq("id", orderId).single(),
  ]);
  if (!order?.charges_informed_at) {
    throw new Error("Inform freight & import duties (after stock confirmation) before generating the Confirmed Order.");
  }
  if ((items ?? []).some((i) => i.item_status === "requested")) {
    throw new Error("Confirm every line (AVAILABLE / UNAVAILABLE) before generating the Confirmed Order.");
  }
  if (!(items ?? []).some((i) => i.item_status === "available")) {
    throw new Error("The Confirmed Order needs at least one AVAILABLE line.");
  }

  await recalcTotals(orderId);
  const { error } = await supabase.rpc("release_order_for_payment", {
    p_order_id: orderId,
    p_hold_type: holdType,
    p_custom_until: holdType === "custom" && customUntil ? new Date(customUntil).toISOString() : null,
  });
  if (error) throw new Error(error.message);
  await logEvent(orderId, staff.id, "released", `Confirmed Order released for payment (stock hold: ${holdType})`, {
    hold_type: holdType,
    custom_until: customUntil ?? null,
  });
  revalidateOrder(orderId);
}

/** Order-level exception for one payment method (null = inherit). */
export async function setOrderPaymentRule(orderId: string, methodCode: string, enabled: boolean | null) {
  const staff = await requireStaff();
  const supabase = await createClient();
  await supabase.from("payment_method_rules").delete().eq("scope", "order").eq("order_id", orderId).eq("method_code", methodCode);
  if (enabled !== null) {
    const { error } = await supabase.from("payment_method_rules").insert({
      scope: "order",
      order_id: orderId,
      method_code: methodCode,
      enabled,
      updated_by: staff.id,
    });
    if (error) throw new Error(error.message);
  }
  await logEvent(
    orderId,
    staff.id,
    "payment_rule",
    `${methodCode}: order exception → ${enabled === null ? "inherit" : enabled ? "allowed" : "blocked"}`
  );
  revalidateOrder(orderId);
}

/**
 * Reserve for Later Delivery: amount = product cost + reserve_markup_pct
 * (Admin, default 10%), shown as the equivalent % of the sale value.
 */
export async function setReserveMode(orderId: string, enabled: boolean) {
  const staff = await requireStaff();
  const supabase = await createClient();

  if (!enabled) {
    await supabase
      .from("orders")
      .update({ payment_mode: "standard", reserve_amount: null, reserve_pct_of_sale: null })
      .eq("id", orderId);
    await logEvent(orderId, staff.id, "reserve", "Payment mode → standard");
    revalidateOrder(orderId);
    return;
  }

  const [{ data: order }, { data: items }, { data: setting }] = await Promise.all([
    supabase.from("orders").select("currency, subtotal").eq("id", orderId).single(),
    supabase.from("order_items").select("qty, unit_cost_brl, item_status").eq("order_id", orderId),
    supabase.from("app_settings").select("value").eq("key", "reserve_markup_pct").maybeSingle(),
  ]);
  if (!order) throw new Error("Order not found");

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
    if (!rate) throw new Error(`No FX rate for ${order.currency}`);
    brlPerUnit = Number(rate.rate);
  }

  const markupPct = Number(setting?.value ?? 10);
  const reserve = computeReserve(costBrl / brlPerUnit, Number(order.subtotal), markupPct);
  const { error } = await supabase
    .from("orders")
    .update({ payment_mode: "reserve", reserve_amount: reserve.amount, reserve_pct_of_sale: reserve.pctOfSale })
    .eq("id", orderId);
  if (error) throw new Error(error.message);
  await logEvent(orderId, staff.id, "reserve", `Payment mode → Reserve (${reserve.amount}, ${reserve.pctOfSale}% of sale)`);
  revalidateOrder(orderId);
}

export interface PaymentInput {
  methodCode: string;
  kind: "full" | "reserve_deposit" | "balance" | "other";
  merchandiseAmount: number;
  freightAmount?: number;
  insuranceAmount?: number;
  fuelSurchargeAmount?: number;
  demandSurchargeAmount?: number;
  exportDeclarationAmount?: number;
  otherDhlAmount?: number;
  dutiesTaxesAmount?: number;
  otherChargesAmount?: number;
  externalRef?: string;
  notes?: string;
  /** Money already received: create the payment CONFIRMED (marks the order paid when fully covered). */
  confirmNow?: boolean;
  /** Amount that actually landed, when different from the expected total (Payment Difference). */
  receivedAmount?: number;
}

/**
 * Registers a payment. Default: PENDING VERIFICATION (→ Payments to Verify).
 * With confirmNow the TDP is recording money already received (e.g. a
 * transfer seen in the bank): the payment is created CONFIRMED and the
 * order becomes PAID once the merchandise is fully covered. That path skips
 * the buyer-facing availability rules — the money is already in.
 * A Bank Transfer automatically carries one Bank Processing Fee (BRL config
 * converted to the order currency) — one per transfer.
 */
export async function registerPayment(orderId: string, input: PaymentInput) {
  const staff = await requireStaff();
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("currency").eq("id", orderId).single();
  if (!order) throw new Error("Order not found");

  if (!input.confirmNow) {
    const { data: methods } = await supabase.rpc("available_payment_methods", { p_order_id: orderId });
    const allowed = ((methods ?? []) as { method_code: string; enabled: boolean }[]).find(
      (m) => m.method_code === input.methodCode
    );
    if (!allowed?.enabled) throw new Error("This payment method is not enabled for this order.");
  }

  const n = (v?: number) => (Number.isFinite(v) ? Number(v) : 0);
  const { error } = await supabase.from("payments").insert({
    order_id: orderId,
    method_code: input.methodCode,
    kind: input.kind,
    currency: order.currency,
    merchandise_amount: n(input.merchandiseAmount),
    freight_amount: n(input.freightAmount),
    insurance_amount: n(input.insuranceAmount),
    fuel_surcharge_amount: n(input.fuelSurchargeAmount),
    demand_surcharge_amount: n(input.demandSurchargeAmount),
    export_declaration_amount: n(input.exportDeclarationAmount),
    other_dhl_amount: n(input.otherDhlAmount),
    duties_taxes_amount: n(input.dutiesTaxesAmount),
    other_charges_amount: n(input.otherChargesAmount),
    external_ref: input.externalRef || null,
    notes: input.notes || null,
    ...(input.confirmNow
      ? {
          status: "confirmed",
          confirmed_by: staff.id,
          ...(input.receivedAmount !== undefined && Number.isFinite(input.receivedAmount)
            ? { received_amount: input.receivedAmount }
            : {}),
        }
      : {}),
  });
  if (error) throw new Error(error.message);
  await logEvent(
    orderId,
    staff.id,
    input.confirmNow ? "payment_received" : "payment_registered",
    `${input.confirmNow ? "Payment received" : "Payment registered"}: ${input.methodCode} · ${input.kind} · ${n(input.merchandiseAmount)} ${order.currency} merchandise`,
    { method: input.methodCode, kind: input.kind, confirm_now: Boolean(input.confirmNow) }
  );
  revalidateOrder(orderId);
}

/** CONFIRM (optionally with the amount actually received → Payment Difference). */
export async function confirmPayment(orderId: string, paymentId: string, receivedAmount?: number) {
  const staff = await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase
    .from("payments")
    .update({
      status: "confirmed",
      confirmed_by: staff.id,
      ...(receivedAmount !== undefined && Number.isFinite(receivedAmount) ? { received_amount: receivedAmount } : {}),
    })
    .eq("id", paymentId)
    .eq("order_id", orderId);
  if (error) throw new Error(error.message);
  await logEvent(orderId, staff.id, "payment_confirmed", "Payment confirmed", { payment_id: paymentId, received: receivedAmount ?? null });
  revalidateOrder(orderId);
}

export async function setPaymentStatus(
  orderId: string,
  paymentId: string,
  status: "rejected" | "refunded" | "chargeback" | "canceled"
) {
  const staff = await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.from("payments").update({ status }).eq("id", paymentId).eq("order_id", orderId);
  if (error) throw new Error(error.message);
  await logEvent(orderId, staff.id, "payment_status", `Payment → ${status}`, { payment_id: paymentId, status });
  revalidateOrder(orderId);
}
