"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentCustomer, isApproved } from "@/lib/auth";

/**
 * Buyer actions: My Favorites and Notify Me. They return `{ error }` codes
 * (never throw) so the UI can show a translated message in production.
 * RLS (migration 0052) restricts every row to the signed-in buyer.
 */

export interface FavoriteState {
  loggedIn: boolean;
  ids: string[];
}

export async function getFavoriteState(): Promise<FavoriteState> {
  const customer = await getCurrentCustomer();
  if (!customer) return { loggedIn: false, ids: [] };
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("favorites").select("product_id").eq("customer_id", customer.id);
    return { loggedIn: true, ids: (data ?? []).map((r) => r.product_id as string) };
  } catch {
    return { loggedIn: true, ids: [] };
  }
}

export async function toggleFavorite(productId: string): Promise<{ favorited?: boolean; error?: string }> {
  const customer = await getCurrentCustomer();
  if (!customer) return { error: "login" };
  try {
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("favorites")
      .select("product_id")
      .eq("customer_id", customer.id)
      .eq("product_id", productId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase.from("favorites").delete().eq("customer_id", customer.id).eq("product_id", productId);
      if (error) return { error: "failed" };
      revalidatePath("/[locale]/minha-conta/favoritos", "page");
      return { favorited: false };
    }
    const { error } = await supabase.from("favorites").insert({ customer_id: customer.id, product_id: productId });
    if (error) return { error: "failed" };
    revalidatePath("/[locale]/minha-conta/favoritos", "page");
    return { favorited: true };
  } catch {
    return { error: "failed" };
  }
}

/** Ask to be notified when a sold-out variant is available again (approved buyers only). */
export async function requestNotify(variantId: string): Promise<{ ok?: boolean; error?: string }> {
  const customer = await getCurrentCustomer();
  if (!customer) return { error: "login" };
  if (!isApproved(customer)) return { error: "approval" };
  try {
    // the variant → product link is resolved on the server; the buyer never sends a product id
    const service = createServiceRoleClient();
    const { data: variant } = await service.from("variants").select("id, product_id, stock").eq("id", variantId).maybeSingle();
    if (!variant) return { error: "failed" };
    if (Number(variant.stock) > 0) return { error: "available" };
    const supabase = await createClient();
    // a request that was already notified is replaced by a fresh one
    await supabase.from("notify_requests").delete().eq("customer_id", customer.id).eq("variant_id", variant.id);
    const { error } = await supabase
      .from("notify_requests")
      .insert({ customer_id: customer.id, product_id: variant.product_id, variant_id: variant.id });
    if (error) return { error: "failed" };
    return { ok: true };
  } catch {
    return { error: "failed" };
  }
}

export async function cancelNotify(variantId: string): Promise<{ ok?: boolean; error?: string }> {
  const customer = await getCurrentCustomer();
  if (!customer) return { error: "login" };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("notify_requests").delete().eq("customer_id", customer.id).eq("variant_id", variantId);
    return error ? { error: "failed" } : { ok: true };
  } catch {
    return { error: "failed" };
  }
}
