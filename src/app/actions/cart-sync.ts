"use server";

import { getCurrentCustomer } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";

export interface SyncCartItem {
  variantId: string;
  productSlug: string;
  title: string;
  color: string;
  size: string;
  qty: number;
  unitPrice: number | null;
  /** Full client cart item, kept so a recovery link restores it exactly. */
  snapshot: Record<string, unknown>;
}

export interface SyncCartResult {
  ok?: boolean;
  /** Not signed in: nothing is persisted (the client stops syncing until reload). */
  skipped?: boolean;
  error?: string;
}

const MAX_ITEMS = 200;

/**
 * Persists the signed-in buyer's cart (carts / cart_items) for the abandoned
 * cart sequence. Called debounced from <CartSync />. Opening a page re-syncs
 * the same contents: that is NOT activity — last_activity_at only moves when
 * the contents change. Returns { error } instead of throwing.
 */
export async function syncCartAction(items: SyncCartItem[], currency: string): Promise<SyncCartResult> {
  try {
    const customer = await getCurrentCustomer();
    if (!customer) return { skipped: true };
    if (!Array.isArray(items) || items.length > MAX_ITEMS) return { error: "Carrinho inválido." };

    const clean = items
      .filter((i) => i && typeof i.variantId === "string" && Number.isFinite(i.qty) && i.qty > 0)
      .map((i) => ({
        variant_id: i.variantId,
        product_slug: String(i.productSlug ?? "").slice(0, 200),
        title: String(i.title ?? "").slice(0, 300),
        color: String(i.color ?? "").slice(0, 100),
        size: String(i.size ?? "").slice(0, 50),
        qty: Math.min(Math.floor(i.qty), 100000),
        unit_price: i.unitPrice !== null && Number.isFinite(i.unitPrice) ? Math.round(i.unitPrice * 100) / 100 : null,
        snapshot: i.snapshot ?? {},
      }));
    const cur = ["BRL", "USD", "EUR"].includes(currency) ? currency : "USD";
    const itemCount = clean.reduce((s, i) => s + i.qty, 0);
    const total = Math.round(clean.reduce((s, i) => s + i.qty * (i.unit_price ?? 0), 0) * 100) / 100;
    const signature = (rows: { variant_id: string | null; qty: number }[]) =>
      rows
        .map((r) => `${r.variant_id}:${r.qty}`)
        .sort()
        .join("|");

    const supabase = createServiceRoleClient();
    const { data: cart } = await supabase.from("carts").select("*").eq("customer_id", customer.id).maybeSingle();

    if (!cart) {
      if (clean.length === 0) return { ok: true };
      const { data: created, error } = await supabase
        .from("carts")
        .insert({ customer_id: customer.id, currency: cur, item_count: itemCount, total_value: total })
        .select("id")
        .single();
      if (error || !created) return { error: error?.message ?? "Falha ao salvar o carrinho." };
      const { error: itemsError } = await supabase.from("cart_items").insert(clean.map((i) => ({ ...i, cart_id: created.id })));
      return itemsError ? { error: itemsError.message } : { ok: true };
    }

    const { data: existing } = await supabase.from("cart_items").select("variant_id, qty").eq("cart_id", cart.id);
    const same = signature(existing ?? []) === signature(clean);

    if (clean.length === 0) {
      if (cart.status === "active" && (existing ?? []).length > 0) {
        await supabase.from("cart_items").delete().eq("cart_id", cart.id);
        await supabase
          .from("carts")
          .update({ status: "emptied", item_count: 0, total_value: 0, updated_at: new Date().toISOString() })
          .eq("id", cart.id);
      }
      return { ok: true };
    }
    if (same && cart.status === "active") return { ok: true };

    // A cart closed by an Order Request / emptied is reopened only by a real change,
    // and not within a minute of the order (the client clears its cart right after).
    const justOrdered = cart.status === "ordered" && cart.ordered_at && Date.now() - new Date(cart.ordered_at).getTime() < 60_000;
    if (cart.status !== "active" && (same || justOrdered)) return { ok: true };

    const now = new Date().toISOString();
    const reopen = cart.status !== "active";
    const { error } = await supabase
      .from("carts")
      .update({
        status: "active",
        currency: cur,
        item_count: itemCount,
        total_value: total,
        last_activity_at: now,
        updated_at: now,
        ...(reopen
          ? { cycle: Number(cart.cycle) + 1, reminder_1_sent_at: null, reminder_2_sent_at: null, order_id: null, ordered_at: null, recovery_token: crypto.randomUUID() }
          : {}),
      })
      .eq("id", cart.id);
    if (error) return { error: error.message };
    await supabase.from("cart_items").delete().eq("cart_id", cart.id);
    const { error: itemsError } = await supabase.from("cart_items").insert(clean.map((i) => ({ ...i, cart_id: cart.id })));
    return itemsError ? { error: itemsError.message } : { ok: true };
  } catch (err) {
    console.error("[cart-sync]", err);
    return { error: err instanceof Error ? err.message : "Falha ao sincronizar o carrinho." };
  }
}
