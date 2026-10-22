"use server";

import { getCurrentCustomer } from "@/lib/auth";
import { evaluateCart, type CartCommercialStatus, type CartLineInput } from "@/lib/commercial-server";

/**
 * Minimum-order and Volume Pricing status of the cart. Read-only; the
 * checkout action re-evaluates the same rules before creating the order.
 */
export async function getCartCommercialStatus(
  lines: CartLineInput[],
  currency: string
): Promise<CartCommercialStatus> {
  const customer = await getCurrentCustomer();
  return evaluateCart(customer?.id ?? null, lines.slice(0, 200), currency);
}
