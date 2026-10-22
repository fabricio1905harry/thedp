"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";
import { EDITABLE_ORDER_STATUSES } from "@/lib/order-status";
import { computeReserve } from "@/lib/payments";

async function requireStaff() {
  const staff = await getCurrentStaff();
  if (!staff) throw new Error("Não autorizado");
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
  if (!data) throw new Error("Linha do pedido não encontrada");
  return {
    ...data,
    label: `${data.product_title ?? "Item"} ${data.color ?? "—"}/${data.size ?? "—"}`,
  };
}

async function assertEditable(orderId: string) {
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("status").eq("id", orderId).single();
  if (!order) throw new Error("Pedido não encontrado");
  if (!EDITABLE_ORDER_STATUSES.includes(order.status)) {
    throw new Error("Este pedido não pode mais ser alterado (já liberado para pagamento / pago).");
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
  dutiesMode?: "prepaid" | "upon_import" | "customer_choice";
}

/**
 * Freight & import duties informed by the TDP after stock confirmation
 * (in the order currency). Closes "DHL Quote Required" in the Action
 * Center; required before generating the Confirmed Order.
 */
async function setOrderChargesImpl(orderId: string, input: OrderChargesInput) {
  const staff = await requireStaff();
  const supabase = await assertEditable(orderId);
  const n = (v: number) => {
    const x = Number(v);
    if (!Number.isFinite(x) || x < 0) throw new Error("Os valores devem ser zero ou positivos.");
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
      duties_mode: input.dutiesMode ?? null,
      delivery_days: input.deliveryDays && input.deliveryDays > 0 ? Math.round(input.deliveryDays) : null,
      charges_note: input.note.trim() || null,
      charges_informed_at: new Date().toISOString(),
      charges_informed_by: staff.id,
    })
    .eq("id", orderId);
  if (error) throw new Error(error.message);
  await logEvent(orderId, staff.id, "charges", "Frete e impostos de importação informados", { ...input });
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
async function setOrderItemStatusImpl(orderId: string, itemId: string, status: ItemStatus, note?: string) {
  const staff = await requireStaff();
  const supabase = await assertEditable(orderId);
  const before = await itemLabel(orderId, itemId);
  const { data: updated, error } = await supabase
    .from("order_items")
    .update({ item_status: status, unavailable_note: note || null, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("order_id", orderId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!updated || updated.length === 0) throw new Error("A linha não foi alterada (sem permissão ou linha inexistente). Rode a migration 0036 no Supabase.");
  await recalcTotals(orderId);
  await logEvent(orderId, staff.id, "item_status", `${before.label}: ${before.item_status} → ${status}`, {
    item_id: itemId,
    from: before.item_status,
    to: status,
    note: note || null,
  });
  revalidateOrder(orderId);
}

async function setOrderItemQtyImpl(orderId: string, itemId: string, qty: number) {
  const staff = await requireStaff();
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("A quantidade deve ser um número inteiro positivo.");
  const supabase = await assertEditable(orderId);
  const before = await itemLabel(orderId, itemId);
  const { data: updated, error } = await supabase
    .from("order_items")
    .update({ qty, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("order_id", orderId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!updated || updated.length === 0) throw new Error("A linha não foi alterada (sem permissão ou linha inexistente). Rode a migration 0036 no Supabase.");
  await recalcTotals(orderId);
  await logEvent(orderId, staff.id, "item_qty", `${before.label}: qtd. ${before.qty} → ${qty}`, {
    item_id: itemId,
    from: before.qty,
    to: qty,
  });
  revalidateOrder(orderId);
}

/** Unit price of one line, in the order currency (the buyer's original price is kept). */
async function setOrderItemPriceImpl(orderId: string, itemId: string, unitPrice: number) {
  const staff = await requireStaff();
  const price = Math.round(Number(unitPrice) * 100) / 100;
  if (!Number.isFinite(price) || price < 0) throw new Error("O preço deve ser zero ou positivo.");
  const supabase = await assertEditable(orderId);
  const before = await itemLabel(orderId, itemId);
  const { data: updated, error } = await supabase
    .from("order_items")
    .update({ unit_price: price, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("order_id", orderId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!updated || updated.length === 0) throw new Error("A linha não foi alterada (sem permissão ou linha inexistente). Rode a migration 0036 no Supabase.");
  await recalcTotals(orderId);
  await logEvent(orderId, staff.id, "item_price", `${before.label}: preço unitário ${before.unit_price} → ${price}`, {
    item_id: itemId,
    from: Number(before.unit_price),
    to: price,
  });
  revalidateOrder(orderId);
}

/** Puts a line back exactly as the buyer requested it (qty, price, status). */
async function restoreOrderItemImpl(orderId: string, itemId: string) {
  const staff = await requireStaff();
  const supabase = await assertEditable(orderId);
  const before = await itemLabel(orderId, itemId);
  if (before.original_qty === null || before.original_unit_price === null) {
    throw new Error("Esta linha foi adicionada pela TDP — marque-a como removida.");
  }
  const { data: updated, error } = await supabase
    .from("order_items")
    .update({
      qty: before.original_qty,
      unit_price: before.original_unit_price,
      item_status: "requested",
      unavailable_note: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("order_id", orderId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!updated || updated.length === 0) throw new Error("A linha não foi alterada (sem permissão ou linha inexistente). Rode a migration 0036 no Supabase.");
  await recalcTotals(orderId);
  await logEvent(orderId, staff.id, "item_restore", `${before.label}: restaurado ao Original Request`, {
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
async function addOrderItemBySkuImpl(
  orderId: string,
  sku: string,
  qty: number,
  substitutesItemId?: string,
  unitPrice?: number
) {
  const staff = await requireStaff();
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("A quantidade deve ser um número inteiro positivo.");
  const supabase = await assertEditable(orderId);

  const [{ data: variant }, { data: order }] = await Promise.all([
    supabase
      .from("variants")
      .select("id, stock, products ( price_brl, price_usd, price_eur )")
      .eq("sku", sku.trim())
      .maybeSingle(),
    supabase.from("orders").select("currency").eq("id", orderId).single(),
  ]);
  if (!variant) throw new Error(`SKU não encontrado: ${sku}`);

  const prices = variant.products as unknown as { price_brl: number | null; price_usd: number | null; price_eur: number | null } | null;
  const currency = (order?.currency ?? "USD").toUpperCase();
  const listPrice =
    currency === "BRL" ? prices?.price_brl : currency === "EUR" ? prices?.price_eur : prices?.price_usd;
  const price = unitPrice !== undefined && Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : listPrice;
  if (price === null || price === undefined) throw new Error(`Sem preço em ${currency} para ${sku} — informe um preço unitário.`);

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
    replaced = ` (substitui ${original.label})`;
    if (original.item_status === "requested" || original.item_status === "available") {
      await supabase.from("order_items").update({ item_status: "removed" }).eq("id", substitutesItemId);
    }
  }

  await recalcTotals(orderId);
  await logEvent(orderId, staff.id, "item_added", `Adicionado ${qty} × ${sku} a ${price}${replaced}`, {
    sku,
    qty,
    unit_price: price,
    substitutes_item_id: substitutesItemId ?? null,
  });
  revalidateOrder(orderId);
}

async function setOrderStageImpl(
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
async function reopenOrderForEditingImpl(orderId: string) {
  const staff = await requireStaff();
  const supabase = await createClient();
  const [{ data: order }, { data: payments }] = await Promise.all([
    supabase.from("orders").select("status").eq("id", orderId).single(),
    supabase.from("payments").select("id, status").eq("order_id", orderId),
  ]);
  if (!order) throw new Error("Pedido não encontrado");
  if (!["confirmed_awaiting_payment", "payment_coordination_required", "payment_window_expired"].includes(order.status)) {
    throw new Error("Somente um Confirmed Order aguardando pagamento pode ser reaberto para edição.");
  }
  if ((payments ?? []).some((p) => p.status === "pending_verification" || p.status === "confirmed")) {
    throw new Error("Este pedido já tem um pagamento — rejeite-o ou reembolse-o antes de editar.");
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
  await logEvent(orderId, staff.id, "reopened", "Confirmed Order reaberto para edição");
  revalidateOrder(orderId);
}

/**
 * Generate the Confirmed Order and open payment with the Temporary Stock
 * Hold (24h / 48h / custom from now) — or Cannot Reserve, which keeps
 * payment disabled and raises PAYMENT COORDINATION REQUIRED. Also used to
 * reopen an expired order after re-confirming stock and values.
 */
async function releaseOrderForPaymentImpl(
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
    throw new Error("Informe o frete e os impostos de importação (após a confirmação de estoque) antes de gerar o Confirmed Order.");
  }
  if ((items ?? []).some((i) => i.item_status === "requested")) {
    throw new Error("Confirme todas as linhas (DISPONÍVEL / INDISPONÍVEL) antes de gerar o Confirmed Order.");
  }
  if (!(items ?? []).some((i) => i.item_status === "available")) {
    throw new Error("O Confirmed Order precisa de pelo menos uma linha DISPONÍVEL.");
  }

  await recalcTotals(orderId);
  const { error } = await supabase.rpc("release_order_for_payment", {
    p_order_id: orderId,
    p_hold_type: holdType,
    p_custom_until: holdType === "custom" && customUntil ? new Date(customUntil).toISOString() : null,
  });
  if (error) throw new Error(error.message);
  await logEvent(orderId, staff.id, "released", `Confirmed Order liberado para pagamento (reserva de estoque: ${holdType})`, {
    hold_type: holdType,
    custom_until: customUntil ?? null,
  });
  revalidateOrder(orderId);
}

/** Order-level exception for one payment method (null = inherit). */
async function setOrderPaymentRuleImpl(orderId: string, methodCode: string, enabled: boolean | null) {
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
    `${methodCode}: exceção do pedido → ${enabled === null ? "herdar" : enabled ? "permitido" : "bloqueado"}`
  );
  revalidateOrder(orderId);
}

/**
 * Reserve for Later Delivery: amount = product cost + reserve_markup_pct
 * (Admin, default 10%), shown as the equivalent % of the sale value.
 */
async function setReserveModeImpl(orderId: string, enabled: boolean) {
  const staff = await requireStaff();
  const supabase = await createClient();

  if (!enabled) {
    await supabase
      .from("orders")
      .update({ payment_mode: "standard", reserve_amount: null, reserve_pct_of_sale: null })
      .eq("id", orderId);
    await logEvent(orderId, staff.id, "reserve", "Modo de pagamento → padrão");
    revalidateOrder(orderId);
    return;
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
  const { error } = await supabase
    .from("orders")
    .update({ payment_mode: "reserve", reserve_amount: reserve.amount, reserve_pct_of_sale: reserve.pctOfSale })
    .eq("id", orderId);
  if (error) throw new Error(error.message);
  await logEvent(orderId, staff.id, "reserve", `Modo de pagamento → Reserve (${reserve.amount}, ${reserve.pctOfSale}% da venda)`);
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
async function registerPaymentImpl(orderId: string, input: PaymentInput) {
  const staff = await requireStaff();
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("currency").eq("id", orderId).single();
  if (!order) throw new Error("Pedido não encontrado");

  if (!input.confirmNow) {
    const { data: methods } = await supabase.rpc("available_payment_methods", { p_order_id: orderId });
    const allowed = ((methods ?? []) as { method_code: string; enabled: boolean }[]).find(
      (m) => m.method_code === input.methodCode
    );
    if (!allowed?.enabled) throw new Error("Esta forma de pagamento não está habilitada para este pedido.");
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
    `${input.confirmNow ? "Pagamento recebido" : "Pagamento registrado"}: ${input.methodCode} · ${input.kind} · ${n(input.merchandiseAmount)} ${order.currency} em mercadoria`,
    { method: input.methodCode, kind: input.kind, confirm_now: Boolean(input.confirmNow) }
  );
  revalidateOrder(orderId);
}

/** CONFIRM (optionally with the amount actually received → Payment Difference). */
async function confirmPaymentImpl(orderId: string, paymentId: string, receivedAmount?: number) {
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
  await logEvent(orderId, staff.id, "payment_confirmed", "Pagamento confirmado", { payment_id: paymentId, received: receivedAmount ?? null });
  revalidateOrder(orderId);
}

async function setPaymentStatusImpl(
  orderId: string,
  paymentId: string,
  status: "rejected" | "refunded" | "chargeback" | "canceled"
) {
  const staff = await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.from("payments").update({ status }).eq("id", paymentId).eq("order_id", orderId);
  if (error) throw new Error(error.message);
  await logEvent(orderId, staff.id, "payment_status", `Pagamento → ${status}`, { payment_id: paymentId, status });
  revalidateOrder(orderId);
}


// ---------------------------------------------------------------------
// Production Next.js hides the message of an error thrown by a Server Action
// ("digest …"). Actions therefore return { error } and the panel shows it.
// ---------------------------------------------------------------------
export type ActionResult = { error?: string };

async function safe<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    console.error("[admin/pedidos]", err);
    return { error: err instanceof Error ? err.message : "Falha na ação." };
  }
}

export async function setOrderCharges(...args: Parameters<typeof setOrderChargesImpl>) {
  return safe(() => setOrderChargesImpl(...args));
}

export async function setOrderItemStatus(...args: Parameters<typeof setOrderItemStatusImpl>) {
  return safe(() => setOrderItemStatusImpl(...args));
}

export async function setOrderItemQty(...args: Parameters<typeof setOrderItemQtyImpl>) {
  return safe(() => setOrderItemQtyImpl(...args));
}

export async function setOrderItemPrice(...args: Parameters<typeof setOrderItemPriceImpl>) {
  return safe(() => setOrderItemPriceImpl(...args));
}

export async function restoreOrderItem(...args: Parameters<typeof restoreOrderItemImpl>) {
  return safe(() => restoreOrderItemImpl(...args));
}

export async function addOrderItemBySku(...args: Parameters<typeof addOrderItemBySkuImpl>) {
  return safe(() => addOrderItemBySkuImpl(...args));
}

export async function setOrderStage(...args: Parameters<typeof setOrderStageImpl>) {
  return safe(() => setOrderStageImpl(...args));
}

export async function reopenOrderForEditing(...args: Parameters<typeof reopenOrderForEditingImpl>) {
  return safe(() => reopenOrderForEditingImpl(...args));
}

export async function releaseOrderForPayment(...args: Parameters<typeof releaseOrderForPaymentImpl>) {
  return safe(() => releaseOrderForPaymentImpl(...args));
}

export async function setOrderPaymentRule(...args: Parameters<typeof setOrderPaymentRuleImpl>) {
  return safe(() => setOrderPaymentRuleImpl(...args));
}

export async function setReserveMode(...args: Parameters<typeof setReserveModeImpl>) {
  return safe(() => setReserveModeImpl(...args));
}

export async function registerPayment(...args: Parameters<typeof registerPaymentImpl>) {
  return safe(() => registerPaymentImpl(...args));
}

export async function confirmPayment(...args: Parameters<typeof confirmPaymentImpl>) {
  return safe(() => confirmPaymentImpl(...args));
}

export async function setPaymentStatus(...args: Parameters<typeof setPaymentStatusImpl>) {
  return safe(() => setPaymentStatusImpl(...args));
}
