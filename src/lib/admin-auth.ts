import { createClient } from "@/lib/supabase/server";

export interface StaffCustomer {
  id: string;
  email: string;
  role: "operator" | "admin";
}

/**
 * ADM-07: role-gated access to /admin, backed by Supabase Auth + RLS
 * (customers_select_self policy lets a user read their own role; the
 * `is_staff()` policies gate everything else in supabase/migrations/0001_init.sql).
 * Returns null when signed out, not staff, or the DB isn't provisioned yet.
 */
export async function getCurrentStaff(): Promise<StaffCustomer | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: customer } = await supabase
      .from("customers")
      .select("id, email, role")
      .eq("id", user.id)
      .single();

    if (!customer || (customer.role !== "operator" && customer.role !== "admin")) {
      return null;
    }
    return customer as StaffCustomer;
  } catch {
    return null;
  }
}
