"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";

/**
 * LOST → RESTOCKED/OPPORTUNITY → CONTACTED → RECOVERED / NOT RECOVERED.
 * History is never deleted; closing every lost sale of a variant closes
 * its Restock Opportunity in the Action Center (DB trigger).
 */
export async function setLostSaleStatus(
  ids: string[],
  status: "contacted" | "recovered" | "not_recovered",
  recovered?: { units: number; revenue: number; orderId?: string }
) {
  const staff = await getCurrentStaff();
  if (!staff) throw new Error("Not authorized");
  const supabase = await createClient();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status };
  if (status === "contacted") patch.contacted_at = now;
  if (status === "recovered" || status === "not_recovered") patch.closed_at = now;
  if (status === "recovered" && recovered) {
    patch.recovered_units = recovered.units;
    patch.recovered_revenue = recovered.revenue;
    patch.recovered_order_id = recovered.orderId || null;
  }
  const { error } = await supabase.from("lost_sales").update(patch).in("id", ids);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/vendas-perdidas");
  revalidatePath("/admin");
}
