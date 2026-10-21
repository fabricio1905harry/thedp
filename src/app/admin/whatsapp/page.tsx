import { createClient } from "@/lib/supabase/server";
import { DEFAULT_WHATSAPP_SETTINGS, normalizeWhatsAppSettings } from "@/lib/whatsapp";
import { saveWhatsAppSettings } from "./actions";

const KINDS = [
  ["general", "Geral (qualquer página)", ""],
  ["product", "Página de produto", "Use {product} (nome + código) e {url}."],
  ["order", "Páginas de pedido", "Use {order} para o número do pedido."],
] as const;

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
      <form action={saveWhatsAppSettings} className="space-y-5 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={s.active} /> Ativo
        </label>
        <label className="flex flex-col max-w-xs">
          Número (com código do país, só dígitos)
          <input name="number" defaultValue={s.number} placeholder="5511999999999" className="border border-border px-2 py-1" />
        </label>
        {KINDS.map(([kind, label, hint]) => (
          <fieldset key={kind} className="border border-border p-3 space-y-2">
            <legend className="text-xs font-medium uppercase px-1">{label}</legend>
            {hint && <p className="text-[11px] text-muted">{hint}</p>}
            {(["en", "es", "pt"] as const).map((loc) => (
              <label key={loc} className="flex flex-col text-xs">
                {loc.toUpperCase()}
                <textarea name={`${kind}_${loc}`} defaultValue={s.messages[kind][loc]} rows={2} className="border border-border px-2 py-1" />
              </label>
            ))}
          </fieldset>
        ))}
        <button type="submit" className="btn-primary px-4 py-2 text-sm">Salvar</button>
      </form>
    </div>
  );
}
