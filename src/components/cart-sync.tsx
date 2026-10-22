"use client";

import { useEffect, useRef } from "react";
import { useCart } from "@/components/cart-provider";
import { useCurrency } from "@/components/currency-provider";
import { pickPrice } from "@/lib/currency";
import { syncCartAction, type SyncCartItem } from "@/app/actions/cart-sync";

const DEBOUNCE_MS = 4000;

/**
 * Mirrors the buyer's cart to the database (debounced) so the abandoned
 * cart reminders can run. Renders nothing. Stops after the server says the
 * visitor is not signed in (restarts on the next page load).
 */
export function CartSync() {
  const { items } = useCart();
  const { currency } = useCurrency();
  const stopped = useRef(false);
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (stopped.current) return;
    const payload: SyncCartItem[] = items.map((item) => ({
      variantId: item.variantId,
      productSlug: item.productSlug,
      title: item.title,
      color: item.color,
      size: item.size,
      qty: item.qty,
      unitPrice: pickPrice(item.pricing, currency)?.amount ?? null,
      snapshot: item as unknown as Record<string, unknown>,
    }));
    const signature = JSON.stringify([currency, payload.map((p) => [p.variantId, p.qty])]);
    // nothing to tell the server about an empty cart that was never synced
    if (lastSent.current === null && payload.length === 0) return;
    if (signature === lastSent.current) return;

    const timer = setTimeout(async () => {
      const result = await syncCartAction(payload, currency);
      if (result.skipped) stopped.current = true;
      else if (!result.error) lastSent.current = signature;
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [items, currency]);

  return null;
}
