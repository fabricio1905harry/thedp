"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentCustomer } from "@/lib/auth";
import { calculateShipmentPackages } from "@/lib/dhl-packaging";
import type { ShipSmartAddress } from "@/lib/shipsmart";
import { COUNTRY_CODES } from "@/lib/countries";
import { queueEmail, queueTeamNotice, flushEmailOutbox, siteOrigin } from "@/lib/email";
import { evaluateCart } from "@/lib/commercial-server";
import type { Shortfall } from "@/lib/order-minimums";

export interface PlaceOrderInput {
  addressId?: string;
  customAddress?: ShipSmartAddress;
  currency: string;
  items: Array<{
    variantId: string;
    productSlug: string;
    title: string;
    color: string;
    size: string;
    qty: number;
    price: number;
  }>;
  isDdp?: boolean;
  /** buyer's UI language (for the confirmation e-mail) */
  locale?: string;
  /** store the typed address in My Account → Addresses */
  saveAddress?: boolean;
}

export interface PlaceOrderResult {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  trackingNumber?: string;
  labelUrl?: string;
  invoiceUrl?: string;
  error?: string;
  /** translated by the client (checkout.errors.*) */
  errorCode?: "auth" | "empty" | "address" | "country" | "generic";
  /** active minimum-order rules the cart does not meet (the buyer UI formats them) */
  minimumShortfalls?: Shortfall[];
}

/**
 * Places the Order Request. Freight and import duties are NOT calculated
 * here — the TDP informs them in the Admin after confirming stock (orders
 * table charge columns, migration 0029), so the order starts with only the
 * merchandise subtotal.
 *
 * Over-stock approach (A11): the browser only ever receives a 0/1
 * availability flag (see catalog.ts). On submit, THIS server action compares
 * every requested quantity with variants.stock and, when something is above
 * what is available, raises the Action Center item "Order above available
 * stock" (high, order_above_stock) with the numbers for the admin. The order
 * is accepted anyway — availability is confirmed before payment.
 */
export async function placeOrderServerAction(
  input: PlaceOrderInput
): Promise<PlaceOrderResult> {
  try {
    const customer = await getCurrentCustomer();
    if (!customer) {
      return { success: false, errorCode: "auth", error: "Please sign in again." };
    }

    if (!input.items || input.items.length === 0) {
      return { success: false, errorCode: "empty", error: "Your cart is empty." };
    }

    // The delivery address must be real: no placeholder fallbacks.
    const typed = input.customAddress;
    const countryCode = String(typed?.countryCode ?? "").toUpperCase();
    if (!typed || !typed.name?.trim() || !typed.address?.trim() || !typed.city?.trim()) {
      return { success: false, errorCode: "address", error: "Please complete the delivery address." };
    }
    if (!COUNTRY_CODES.includes(countryCode)) {
      return { success: false, errorCode: "country", error: "Please choose the delivery country." };
    }

    const supabase = createServiceRoleClient();

    // Commercial rules, enforced here regardless of what the browser showed:
    // active minimum-order rules block the request; Volume Pricing (when ON)
    // lowers the unit prices before the order is created.
    const commercial = await evaluateCart(
      customer.id,
      input.items.map((i) => ({ variantId: i.variantId, qty: i.qty, price: i.price })),
      input.currency || "BRL"
    );
    if (commercial.shortfalls.length > 0) {
      return { success: false, error: "Minimum order not met.", minimumShortfalls: commercial.shortfalls };
    }
    const volumePrice = new Map(commercial.volume.lines.map((l) => [l.variantId, l]));
    const pricedItems = input.items.map((item) => ({ ...item, price: volumePrice.get(item.variantId)?.unitPrice ?? item.price }));

    const totalQty = pricedItems.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = Math.round(pricedItems.reduce((sum, item) => sum + item.price * item.qty, 0) * 100) / 100;

    // 1. Calculate DHL Packaging & Weight
    const packaging = await calculateShipmentPackages({
      quantity: totalQty,
      category: "Vestidos",
      unitWeightKg: 1.6,
    });

    // 2. Destination address (the ISO country code is stored: it drives channel/currency/freight later)
    const address: ShipSmartAddress = {
      ...typed,
      name: typed.name.trim().slice(0, 200),
      address: typed.address.trim().slice(0, 300),
      city: typed.city.trim().slice(0, 120),
      state: (typed.state ?? "").trim().slice(0, 120),
      postalCode: (typed.postalCode ?? "").trim().slice(0, 40),
      countryCode,
      email: customer.email,
    };

    const orderNum = `TD-${Math.floor(100000 + Math.random() * 900000)}`;

    // 3. Create Order record in Database
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        customer_id: customer.id,
        order_number: orderNum,
        // Order Request: the TDP confirms stock with the supplier, adjusts
        // the composition and releases the Confirmed Order for payment.
        status: "order_request",
        currency: input.currency || "BRL",
        subtotal,
        total: subtotal,
        incoterm: input.isDdp ? "DDP" : "DDU",
        shipping_address: address,
        // suggested packaging only, to help the TDP quote DHL
        quote_snapshot: {
          packaging,
          ...(commercial.volume.lines.length > 0
            ? { volume_pricing: { discount_total: commercial.volume.discountTotal, lines: commercial.volume.lines } }
            : {}),
        },
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      return { success: false, errorCode: "generic", error: orderErr?.message || "Could not create the order." };
    }

    // 4. Insert Order Items into order_items table
    const itemRecords = pricedItems.map((item) => ({
      order_id: order.id,
      variant_id: item.variantId,
      qty: item.qty,
      unit_price: item.price,
    }));

    const { error: itemsErr } = await supabase.from("order_items").insert(itemRecords);
    if (itemsErr) {
      // never leave an empty order behind
      await supabase.from("orders").delete().eq("id", order.id);
      return { success: false, errorCode: "generic", error: itemsErr.message };
    }

    // 5. Over-stock check (server side, numbers never reach the browser)
    const aboveStock = await checkAboveStock(order.id, orderNum, input, subtotal);

    // 6. Save the typed address in My Account → Addresses (once, no duplicates)
    if (input.saveAddress) {
      const { data: dup } = await supabase
        .from("addresses")
        .select("id")
        .eq("customer_id", customer.id)
        .eq("country", countryCode)
        .eq("line1", address.address)
        .eq("postal_code", address.postalCode || "")
        .limit(1);
      if (!dup || dup.length === 0) {
        await supabase.from("addresses").insert({
          customer_id: customer.id,
          country: countryCode,
          state: address.state || null,
          city: address.city,
          line1: address.address,
          postal_code: address.postalCode || "",
          phone: null,
        });
      }
    }

    // 7. E-mails: buyer confirmation + internal notice (queued; sent right away when configured)
    const origin = siteOrigin();
    const localeSeg = ["en", "es", "pt"].includes(input.locale ?? "") ? input.locale : "en";
    await queueEmail(customer.email, "order_request_received", input.locale, {
      buyer_name: address.name,
      order_number: orderNum,
      currency: input.currency,
      account_url: origin ? `${origin}/${localeSeg}/minha-conta` : "",
    });
    await queueTeamNotice("internal_new_order", {
      order_number: orderNum,
      buyer: address.name,
      currency: input.currency,
      total: `${input.currency} ${subtotal.toFixed(2)}`,
      above_stock: aboveStock,
      admin_url: origin ? `${origin}/admin/pedidos/${order.id}` : "",
    });
    await flushEmailOutbox(5).catch(() => undefined);

    // DHL/ShipSmart shipment (AWB + label) is NOT created here — the order
    // is placed as an Order Request and only the shipping/duties estimate
    // is stored. Staff confirm stock, release the Confirmed Order for
    // payment and trigger the DHL shipment from /admin/pedidos/[id].
    return {
      success: true,
      orderId: order.id,
      orderNumber: orderNum,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Could not place the order.";
    return { success: false, errorCode: "generic", error: msg };
  }
}

/**
 * Compares each requested quantity with the variant stock on the server and
 * raises the Action Center item "Order above available stock" (high) with the
 * details for the admin. Returns true when something is above stock.
 * Never throws — an Order Request is accepted regardless.
 */
async function checkAboveStock(orderId: string, orderNumber: string, input: PlaceOrderInput, subtotal: number): Promise<boolean> {
  try {
    const supabase = createServiceRoleClient();
    const wanted = new Map<string, number>();
    for (const it of input.items) wanted.set(it.variantId, (wanted.get(it.variantId) ?? 0) + it.qty);

    const { data: variants } = await supabase
      .from("variants")
      .select("id, sku, color, size, stock, products ( title )")
      .in("id", [...wanted.keys()]);

    const over: { sku: string; label: string; ordered: number; stock: number }[] = [];
    for (const v of variants ?? []) {
      const ordered = wanted.get(v.id) ?? 0;
      const stock = Math.max(0, Number(v.stock ?? 0));
      if (ordered > stock) {
        const product = Array.isArray(v.products) ? v.products[0] : v.products;
        over.push({
          sku: v.sku,
          label: `${product?.title ?? v.sku} ${v.color ?? ""} ${v.size ?? ""}`.replace(/\s+/g, " ").trim(),
          ordered,
          stock,
        });
      }
    }
    if (over.length === 0) return false;

    const details = over.map((o) => `${o.label}: pedido ${o.ordered} / estoque ${o.stock}`).join("; ").slice(0, 400);
    await supabase.rpc("raise_action", {
      p_type: "order_above_stock",
      p_dedupe: `order_above_stock:${orderId}`,
      p_title: "Order above available stock",
      p_reference_type: "order",
      p_reference_id: orderId,
      p_reference_label: orderNumber,
      p_subject: details,
      p_value: subtotal,
      p_currency: input.currency,
      p_count: over.length,
      p_href: `/admin/pedidos/${orderId}`,
      p_severity: "high",
      p_metadata: { lines: over },
    });
    return true;
  } catch {
    return false;
  }
}
