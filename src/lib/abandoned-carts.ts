import { createServiceRoleClient } from "@/lib/supabase/server";
import { queueNotification } from "@/lib/notifications";

/**
 * Abandoned-cart sequence (hourly cron):
 *   e-mail 1 after abandoned_cart_hours_1 (default 2 h) of inactivity,
 *   e-mail 2 after abandoned_cart_hours_2 (default 24 h).
 * The sequence stops by itself: an Order Request closes the cart
 * (trigger, migration 0071) and an emptied cart is closed by the sync
 * action; only carts with status 'active' and items are considered.
 * Settings (app_settings): abandoned_cart_enabled, abandoned_cart_hours_1/2.
 */

export interface AbandonedCartRun {
  enabled: boolean;
  firstSent: number;
  secondSent: number;
  abandoned: number;
}

export async function getAbandonedCartSettings() {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["abandoned_cart_enabled", "abandoned_cart_hours_1", "abandoned_cart_hours_2"]);
  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback);
  return {
    enabled: map.abandoned_cart_enabled !== false,
    hours1: num(map.abandoned_cart_hours_1, 2),
    hours2: num(map.abandoned_cart_hours_2, 24),
  };
}

export async function processAbandonedCarts(): Promise<AbandonedCartRun> {
  const supabase = createServiceRoleClient();
  const settings = await getAbandonedCartSettings();
  const out: AbandonedCartRun = { enabled: settings.enabled, firstSent: 0, secondSent: 0, abandoned: 0 };
  if (!settings.enabled) {
    await supabase.rpc("resolve_action", { p_dedupe: "abandoned_carts:summary" });
    return out;
  }

  const now = Date.now();
  const cutoff = new Date(now - Math.min(settings.hours1, settings.hours2) * 3600_000).toISOString();
  const { data: carts } = await supabase
    .from("carts")
    .select("id, customer_id, currency, item_count, total_value, cycle, last_activity_at, reminder_1_sent_at, reminder_2_sent_at, recovery_token, customers!inner ( status )")
    .eq("status", "active")
    .gt("item_count", 0)
    .lte("last_activity_at", cutoff)
    .limit(500);

  for (const cart of carts ?? []) {
    const customer = Array.isArray(cart.customers) ? cart.customers[0] : cart.customers;
    if (customer?.status !== "approved") continue;
    out.abandoned++;
    const idleHours = (now - new Date(cart.last_activity_at).getTime()) / 3600_000;
    let step: 1 | 2 | null = null;
    if (!cart.reminder_1_sent_at && idleHours >= settings.hours1) step = 1;
    else if (cart.reminder_1_sent_at && !cart.reminder_2_sent_at && idleHours >= settings.hours2) step = 2;
    if (!step) continue;

    const { data: items } = await supabase.from("cart_items").select("title, color, size, qty").eq("cart_id", cart.id).order("created_at");
    const itemsText = (items ?? [])
      .slice(0, 12)
      .map((i) => `- ${i.title ?? ""} · ${i.color ?? ""} / ${i.size ?? ""} × ${i.qty}`)
      .join("\n");
    const result = await queueNotification(
      `abandoned_cart_${step}`,
      cart.customer_id,
      null,
      {
        cart_token: cart.recovery_token,
        cart_items_text: itemsText,
        item_count: cart.item_count,
        cart_total: cart.total_value,
        currency: cart.currency,
      },
      `abandoned_cart_${step}:${cart.id}:${cart.cycle}`
    );
    if (result.error) continue;
    const column = step === 1 ? "reminder_1_sent_at" : "reminder_2_sent_at";
    // guard: only mark if the cart is still active (an order may have closed it meanwhile)
    await supabase.from("carts").update({ [column]: new Date().toISOString() }).eq("id", cart.id).eq("status", "active");
    if (step === 1) out.firstSent++;
    else out.secondSent++;
  }

  // Action Center summary (recoverable revenue)
  if (out.abandoned > 0) {
    const currencies = new Set((carts ?? []).map((c) => c.currency));
    const total = (carts ?? []).reduce((s, c) => s + Number(c.total_value ?? 0), 0);
    await supabase.rpc("raise_action", {
      p_type: "abandoned_carts",
      p_dedupe: "abandoned_carts:summary",
      p_title: `${out.abandoned} abandoned cart(s)`,
      p_reference_type: null,
      p_reference_id: null,
      p_reference_label: null,
      p_subject: "Abandoned carts",
      p_value: currencies.size === 1 ? Math.round(total * 100) / 100 : null,
      p_currency: currencies.size === 1 ? [...currencies][0] : null,
      p_count: out.abandoned,
      p_href: "/admin/carrinhos",
      p_severity: null,
      p_metadata: null,
    });
  } else {
    await supabase.rpc("resolve_action", { p_dedupe: "abandoned_carts:summary" });
  }
  return out;
}
