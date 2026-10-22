"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentCustomer } from "@/lib/auth";
import { flushEmailOutbox, queueEmail, queueTeamNotice, siteOrigin } from "@/lib/email";

export interface ContactState {
  status: "idle" | "success" | "error";
  message?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Contact form → contact_messages (Admin → Contatos recebidos) + Action Center. */
export async function submitContactMessage(_prev: ContactState, formData: FormData): Promise<ContactState> {
  // honeypot: real visitors never fill this hidden field
  if (String(formData.get("website") ?? "").trim()) return { status: "success" };

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!name || !EMAIL_RE.test(email) || !subject || message.length < 3) {
    return { status: "error", message: "invalid" };
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { status: "error", message: "unavailable" };
  }

  try {
    const customer = await getCurrentCustomer();
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("contact_messages").insert({
      name: name.slice(0, 200),
      company: String(formData.get("company") ?? "").trim().slice(0, 200) || null,
      email: email.slice(0, 200),
      phone: String(formData.get("phone") ?? "").trim().slice(0, 60) || null,
      country: String(formData.get("country") ?? "").trim().slice(0, 100) || null,
      subject: subject.slice(0, 200),
      message: message.slice(0, 5000),
      locale: String(formData.get("locale") ?? "").slice(0, 8) || null,
      customer_id: customer?.id ?? null,
    });
    if (error) return { status: "error", message: "unavailable" };

    // confirmation to the sender + internal notice to the team (queued; never blocks the form)
    const locale = String(formData.get("locale") ?? "");
    const origin = siteOrigin();
    await queueEmail(email, "contact_received", locale, { buyer_name: name, message });
    await queueTeamNotice("internal_new_contact", {
      subject,
      sender: name,
      email,
      message,
      admin_url: origin ? `${origin}/admin/contatos?status=new` : "",
    });
    await flushEmailOutbox(5).catch(() => undefined);
    return { status: "success" };
  } catch {
    return { status: "error", message: "unavailable" };
  }
}
