"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentCustomer } from "@/lib/auth";
import { calculateShipmentPackages } from "@/lib/dhl-packaging";
import {
  calculateShipSmartQuote,
  mapOrderPackagesToShipSmart,
  ShipSmartAddress,
} from "@/lib/shipsmart";

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

export interface CalculateShippingResult {
  success: boolean;
  packageCount: number;
  packageName: string;
  dimensionsText: string;
  totalWeightKg: number;
  shippingPriceBrl: number;
  shippingPricePicked: number;
  deliveryDays: number;
  dutiesEstimateBrl: number;
  hasReviewRequired: boolean;
  error?: string;
}

/**
 * Calculates real-time DHL Express shipping rate via ShipSmart for checkout.
 */
export async function calculateCheckoutShippingAction(
  input: PlaceOrderInput
): Promise<CalculateShippingResult> {
  try {
    if (!input.items || input.items.length === 0) {
      return {
        success: false,
        packageCount: 0,
        packageName: "",
        dimensionsText: "",
        totalWeightKg: 0,
        shippingPriceBrl: 0,
        shippingPricePicked: 0,
        deliveryDays: 0,
        dutiesEstimateBrl: 0,
        hasReviewRequired: false,
        error: "Carrinho vazio",
      };
    }

    const totalQty = input.items.reduce((sum, item) => sum + item.qty, 0);

    // 1. Run DHL Packaging Algorithm
    const packaging = await calculateShipmentPackages({
      quantity: totalQty,
      category: "Vestidos",
      unitWeightKg: 1.6,
    });

    const primaryPkg = packaging.packages[0];
    const dimensionsText = primaryPkg
      ? `${primaryPkg.length_cm}x${primaryPkg.width_cm}x${primaryPkg.height_cm} cm`
      : "Medidas Padrão DHL";

    // 2. Prepare Destination Address
    const address: ShipSmartAddress = input.customAddress || {
      name: "Cliente The Dress",
      address: "Rua Exemplo, 100",
      city: "Nova York",
      state: "NY",
      postalCode: "10001",
      countryCode: "US",
    };

    const shipSmartPackages = mapOrderPackagesToShipSmart(packaging.packages);
    const declaredValue = input.items.reduce((sum, i) => sum + i.price * i.qty, 0);

    // 3. Call ShipSmart Quote Engine
    const quote = await calculateShipSmartQuote({
      destination: address,
      packages: shipSmartPackages,
      declaredValueAmount: declaredValue,
      isDdp: input.isDdp ?? false,
    });

    const primaryRate = quote.rates[0];
    const shippingPriceBrl = primaryRate?.priceBrl ?? 250.0;
    const deliveryDays = primaryRate?.estimatedDeliveryDays ?? 3;
    const dutiesBrl = primaryRate?.ddpEstimatedDutiesBrl ?? 0;

    return {
      success: true,
      packageCount: packaging.number_of_packages,
      packageName: primaryPkg?.packaging_name ?? "DHL Express Box",
      dimensionsText,
      totalWeightKg: primaryPkg?.final_weight_kg ?? 2.0,
      shippingPriceBrl,
      shippingPricePicked: shippingPriceBrl,
      deliveryDays,
      dutiesEstimateBrl: dutiesBrl,
      hasReviewRequired: packaging.has_review_required,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao calcular frete DHL";
    return {
      success: false,
      packageCount: 0,
      packageName: "",
      dimensionsText: "",
      totalWeightKg: 0,
      shippingPriceBrl: 0,
      shippingPricePicked: 0,
      deliveryDays: 0,
      dutiesEstimateBrl: 0,
      hasReviewRequired: false,
      error: msg,
    };
  }
}

/**
 * Places real order in database, generates DHL shipment AWB and label.
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

    const shipSmartPackages = mapOrderPackagesToShipSmart(packaging.packages);

    // 3. Calculate DHL Shipping Rate
    const quote = await calculateShipSmartQuote({
      destination: address,
      packages: shipSmartPackages,
      declaredValueAmount: subtotal,
      isDdp: input.isDdp ?? false,
    });

    const primaryRate = quote.rates[0];
    const shippingCost = primaryRate?.priceBrl ?? 250.0;
    const dutiesEstimate = primaryRate?.ddpEstimatedDutiesBrl ?? 0;
    const total = subtotal + shippingCost + dutiesEstimate;

    const orderNum = `TD-${Math.floor(100000 + Math.random() * 900000)}`;

    // 4. Create Order record in Database
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        customer_id: customer.id,
        order_number: orderNum,
        status: "processing",
        currency: input.currency || "BRL",
        subtotal,
        shipping_cost: shippingCost,
        duties_estimate: dutiesEstimate,
        total,
        incoterm: input.isDdp ? "DDP" : "DDU",
        shipping_address: address,
        quote_snapshot: {
          packaging,
          quote: primaryRate,
        },
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      return { success: false, error: orderErr?.message || "Erro ao criar pedido no banco" };
    }

    // 5. Insert Order Items into order_items table
    const itemRecords = input.items.map((item) => ({
      order_id: order.id,
      variant_id: item.variantId,
      qty: item.qty,
      unit_price: item.price,
    }));

    await supabase.from("order_items").insert(itemRecords);

    // DHL/ShipSmart shipment (AWB + label) is NOT created here — the order
    // is placed with status "processing" (shown as "Em Separação") and only
    // the shipping/duties estimate is stored. Staff trigger the actual DHL
    // shipment manually from /admin/pedidos/[id] once the order is packed.
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
