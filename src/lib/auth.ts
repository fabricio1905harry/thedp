import { createClient } from "@/lib/supabase/server";
import type { CustomerStatus } from "@/lib/types";

export interface CurrentCustomer {
  id: string;
  email: string;
  status: CustomerStatus;
}

/**
 * AUTH-02: resolves the logged-in customer's approval status so pages can
 * gate price/CTA rendering. Returns null when signed out, when the DB isn't
 * provisioned yet (task #2), or on any lookup error — callers must treat
 * null the same as "not approved."
 */
export async function getCurrentCustomer(): Promise<CurrentCustomer | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: customer } = await supabase
      .from("customers")
      .select("id, email, status")
      .eq("id", user.id)
      .single();

    if (!customer) return null;
    return customer as CurrentCustomer;
  } catch {
    return null;
  }
}

export function isApproved(customer: CurrentCustomer | null): boolean {
  return customer?.status === "approved";
}
