"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentCustomer } from "@/lib/auth";
import { calculateShipmentPackages } from "@/lib/dhl-packaging";
import type { ShipSmartAddress } from "@/lib/shipsmart";

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
}

export interface PlaceOrderResult {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  trackingNumber?: string;
  labelUrl?: string;
  invoiceUrl?: string;
  error?: string;
}

/**
 * Places the Order Request. Freight and import duties are NOT calculated
 * here — the TDP informs them in the Admin after confirming stock (orders
 * table charge columns, migration 0029), so the order starts with only the
 * merchandise subtotal.
 */
export async function placeOrderServerAction(
  input: PlaceOrderInput
): Promise<PlaceOrderResult> {
  try {
    const customer = await getCurrentCustomer();
    if (!customer) {
      return { success: false, error: "Usuário não autenticado. Por favor, faça login." };
    }

    if (!input.items || input.items.length === 0) {
      return { success: false, error: "Carrinho de compras está vazio." };
    }

    const supabase = createServiceRoleClient();
    const totalQty = input.items.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = input.items.reduce((sum, item) => sum + item.price * item.qty, 0);

    // 1. Calculate DHL Packaging & Weight
    const packaging = await calculateShipmentPackages({
      quantity: totalQty,
      category: "Vestidos",
      unitWeightKg: 1.6,
    });

    // 2. Prepare Destination Address
    const address: ShipSmartAddress = input.customAddress || {
      name: customer.email ? customer.email.split("@")[0] : "Cliente The Dress",
      email: customer.email,
      address: "Avenida Principal, 500",
      city: "Nova York",
      state: "NY",
      postalCode: "10001",
      countryCode: "US",
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
        quote_snapshot: { packaging },
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      return { success: false, error: orderErr?.message || "Erro ao criar pedido no banco" };
    }

    // 4. Insert Order Items into order_items table
    const itemRecords = input.items.map((item) => ({
      order_id: order.id,
      variant_id: item.variantId,
      qty: item.qty,
      unit_price: item.price,
    }));

    await supabase.from("order_items").insert(itemRecords);

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
    const msg = err instanceof Error ? err.message : "Erro ao finalizar pedido";
    return { success: false, error: msg };
  }
}
