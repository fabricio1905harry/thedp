"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { useCart, type CartItem } from "@/components/cart-provider";

/** Puts the saved items back into the browser cart (items already there are kept) and opens /carrinho. */
export function RecoverCart({ items }: { items: Record<string, unknown>[] }) {
  const { items: current, addItem } = useCart();
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const have = new Set(current.map((i) => i.variantId));
    for (const raw of items) {
      const item = raw as unknown as CartItem;
      if (!item.variantId || have.has(item.variantId)) continue;
      const { qty, ...rest } = item;
      addItem(rest, Math.max(1, Number(qty) || 1));
    }
    router.replace("/carrinho");
  }, [items, current, addItem, router]);

  return <p className="text-sm text-muted">…</p>;
}
