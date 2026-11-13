import { createClient } from "@/lib/supabase/server";
import { DEFAULT_WHATSAPP_SETTINGS, normalizeWhatsAppSettings } from "@/lib/whatsapp";
import { WhatsAppSettingsForm } from "@/components/whatsapp-settings-form";

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

export default async function AdminWhatsAppPage() {
  const supabase = await createClient();
  const [{ data: setting }, { count: clicks30d }] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "whatsapp").maybeSingle(),
    supabase
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("event", "whatsapp_click")
      .gte("created_at", daysAgoIso(30)),
  ]);
  const s = setting ? normalizeWhatsAppSettings(setting.value) : DEFAULT_WHATSAPP_SETTINGS;

  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-2xl mb-1">Botão do WhatsApp</h1>
      <p className="text-sm text-muted mb-6">
        Botão flutuante no desktop + celular. As mensagens seguem o idioma do site. Apenas nome/código do produto + URL ou o
        número do pedido são adicionados automaticamente — nunca dados pessoais ou valores. Os cliques são registrados como
        <code> whatsapp_click</code> (últimos 30 dias: {clicks30d ?? 0}).
      </p>
      <WhatsAppSettingsForm settings={s} />
    </div>
  );
}
