import type { SupabaseClient } from "@supabase/supabase-js";
import { queueTeamNotice, siteOrigin } from "@/lib/email";

/**
 * Paid placement reminders (7 days, 1 day and on the day). The database returns each reminder
 * once (due_placement_reminders logs it); the team gets an e-mail with the renew / extend / end link.
 */
export async function sendPlacementReminders(supabase: SupabaseClient): Promise<{ sent: number }> {
  const { data, error } = await supabase.rpc("due_placement_reminders");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { src: string; label: string; partner: string | null; placement_end: string; days_before: number }[];
  const origin = siteOrigin();
  for (const r of rows) {
    const when = r.days_before === 0 ? "termina hoje" : r.days_before === 1 ? "termina amanhã" : `termina em até ${r.days_before} dias`;
    await queueTeamNotice("internal_new_contact", {
      subject: `Placement pago ${when}: ${r.label}`,
      sender: "TDP Admin",
      email: "",
      message: `O placement pago de “${r.label}”${r.partner ? ` (parceiro ${r.partner})` : ""} ${when} (fim em ${r.placement_end}). Renove, estenda ou encerre em Admin → Placements pagos. O item continua no site; só o destaque pago termina.`,
      admin_url: origin ? `${origin}/admin/placements` : "",
    });
  }
  return { sent: rows.length };
}
