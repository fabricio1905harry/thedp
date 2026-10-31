import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";
import { emailConfigured } from "@/lib/email";
import { messagingProvider } from "@/lib/messaging-adapter";
import { NotificationTemplateEditor } from "@/components/notification-template-editor";
import { NotificationAdminControls } from "@/components/notification-admin-controls";
import {
  CHANNEL_LABELS_PT,
  EVENT_BY_CODE,
  NOTIFICATION_EVENTS,
  NOTIFICATION_LOCALES,
  type NotificationChannel,
} from "@/lib/notification-events";

interface TemplateRow {
  event: string;
  channel: NotificationChannel;
  locale: "en" | "es" | "pt";
  subject: string;
  body: string;
  approved: boolean;
}

interface LogRow {
  id: string;
  created_at: string;
  event: string;
  channel: string;
  locale: string;
  to_address: string | null;
  status: string;
  provider: string | null;
  error: string | null;
  is_test: boolean;
  order_id: string | null;
}

const STATUS_PT: Record<string, string> = { queued: "NA FILA", sent: "ENVIADO", failed: "FALHOU", skipped: "IGNORADO" };

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; event?: string; status?: string; channel?: string }>;
}) {
  const { tab, event, status, channel } = await searchParams;
  const staff = await getCurrentStaff();
  const supabase = await createClient();
  const isLog = tab === "log";

  const [{ data: templates }, { data: settings }] = await Promise.all([
    supabase.from("notification_templates").select("event, channel, locale, subject, body, approved"),
    supabase.from("app_settings").select("key, value").in("key", ["notifications_require_approval", "payment_window_reminder_hours"]),
  ]);
  const byKey = new Map((templates as TemplateRow[] | null ?? []).map((t) => [`${t.event}|${t.channel}|${t.locale}`, t]));
  const setting = Object.fromEntries((settings ?? []).map((s) => [s.key, s.value]));

  let logRows: LogRow[] = [];
  if (isLog) {
    let query = supabase
      .from("notification_log")
      .select("id, created_at, event, channel, locale, to_address, status, provider, error, is_test, order_id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (status) query = query.eq("status", status);
    if (channel) query = query.eq("channel", channel);
    const { data } = await query;
    logRows = (data ?? []) as LogRow[];
  }

  const selected = event ? EVENT_BY_CODE[event] : undefined;
  const groups = [...new Set(NOTIFICATION_EVENTS.map((e) => e.group))];

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="font-serif text-2xl mb-1">Notificações</h1>
        <p className="text-sm text-muted">
          Textos por evento × canal × idioma. Somente textos <strong>aprovados</strong> são enviados — nada é traduzido automaticamente no envio. Eventos entram na fila sozinhos quando o status do pedido muda.
        </p>
      </div>

      <NotificationAdminControls
        requireApproval={setting.notifications_require_approval !== false}
        reminderHours={Number(setting.payment_window_reminder_hours ?? 6)}
        emailConfigured={emailConfigured()}
        whatsappProvider={messagingProvider("whatsapp")}
        smsProvider={messagingProvider("sms")}
      />

      <div className="flex gap-2 text-xs">
        <Link href="/admin/notificacoes" className={`border px-3 py-1.5 ${!isLog ? "border-foreground font-semibold" : "border-border"}`}>
          Textos
        </Link>
        <Link href="/admin/notificacoes?tab=log" className={`border px-3 py-1.5 ${isLog ? "border-foreground font-semibold" : "border-border"}`}>
          Histórico de envios
        </Link>
      </div>

      {isLog ? (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            {[["", "Todos"], ["queued", "Na fila"], ["sent", "Enviados"], ["failed", "Falharam"]].map(([value, label]) => (
              <Link key={value} href={`/admin/notificacoes?tab=log${value ? `&status=${value}` : ""}${channel ? `&channel=${channel}` : ""}`} className={`border px-2.5 py-1 ${(status ?? "") === value ? "border-foreground font-semibold" : "border-border"}`}>
                {label}
              </Link>
            ))}
            <span className="text-muted self-center">|</span>
            {[["", "Todos os canais"], ["email", "E-mail"], ["whatsapp", "WhatsApp"], ["sms", "SMS"]].map(([value, label]) => (
              <Link key={value} href={`/admin/notificacoes?tab=log${status ? `&status=${status}` : ""}${value ? `&channel=${value}` : ""}`} className={`border px-2.5 py-1 ${(channel ?? "") === value ? "border-foreground font-semibold" : "border-border"}`}>
                {label}
              </Link>
            ))}
          </div>
          {logRows.length === 0 ? (
            <p className="text-sm text-muted">Nenhum envio registrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr>
                    <th className="p-2">Quando</th>
                    <th className="p-2">Evento</th>
                    <th className="p-2">Canal</th>
                    <th className="p-2">Destino</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {logRows.map((row) => (
                    <tr key={row.id} className="border-t border-border align-top">
                      <td className="p-2 whitespace-nowrap">{new Date(row.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                      <td className="p-2">
                        {EVENT_BY_CODE[row.event]?.label ?? row.event}
                        {row.is_test && <span className="ml-1 text-[10px] border border-border px-1">TESTE</span>}
                      </td>
                      <td className="p-2">{CHANNEL_LABELS_PT[row.channel as NotificationChannel] ?? row.channel} · {row.locale.toUpperCase()}</td>
                      <td className="p-2">
                        {row.to_address ?? "—"}
                        {row.order_id && (
                          <Link href={`/admin/pedidos/${row.order_id}`} className="block text-accent underline">
                            pedido
                          </Link>
                        )}
                      </td>
                      <td className="p-2 font-semibold">
                        {STATUS_PT[row.status] ?? row.status}
                        {row.provider === "mock" && <span className="ml-1 font-normal text-muted">(MOCK)</span>}
                      </td>
                      <td className="p-2 text-muted max-w-xs">{row.error ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : selected ? (
        <section className="space-y-4">
          <Link href="/admin/notificacoes" className="text-xs text-muted hover:text-accent">
            ← Todos os eventos
          </Link>
          <div>
            <h2 className="font-serif text-xl">{selected.label}</h2>
            <p className="text-sm text-muted">{selected.description}</p>
          </div>
          {selected.channels.map((ch) => (
            <div key={ch} className="space-y-3">
              <h3 className="text-xs uppercase tracking-wider text-muted">{CHANNEL_LABELS_PT[ch]}</h3>
              <div className="grid lg:grid-cols-1 gap-3">
                {NOTIFICATION_LOCALES.map((locale) => {
                  const row = byKey.get(`${selected.code}|${ch}|${locale}`);
                  return (
                    <NotificationTemplateEditor
                      key={`${selected.code}-${ch}-${locale}-${row?.approved}-${row?.body?.length}`}
                      event={selected.code}
                      channel={ch}
                      locale={locale}
                      placeholders={selected.placeholders}
                      initial={{ subject: row?.subject ?? "", body: row?.body ?? "", approved: row?.approved ?? false, exists: Boolean(row) }}
                      defaultTo={ch === "email" ? staff?.email ?? "" : ""}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <section className="space-y-5">
          {groups.map((group) => (
            <div key={group} className="space-y-2">
              <h2 className="text-xs uppercase tracking-wider text-muted">{group}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr>
                      <th className="p-2">Evento</th>
                      {(["email", "whatsapp", "sms"] as const).map((ch) => (
                        <th key={ch} className="p-2">
                          {CHANNEL_LABELS_PT[ch]} (EN / ES / PT)
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {NOTIFICATION_EVENTS.filter((e) => e.group === group).map((def) => (
                      <tr key={def.code} className="border-t border-border">
                        <td className="p-2">
                          <Link href={`/admin/notificacoes?event=${def.code}`} className="underline font-medium">
                            {def.label}
                          </Link>
                        </td>
                        {(["email", "whatsapp", "sms"] as const).map((ch) => (
                          <td key={ch} className="p-2 whitespace-nowrap">
                            {def.channels.includes(ch)
                              ? NOTIFICATION_LOCALES.map((locale) => {
                                  const row = byKey.get(`${def.code}|${ch}|${locale}`);
                                  return (
                                    <span key={locale} title={row ? (row.approved ? "Aprovado" : "Rascunho") : "Não criado"} className={`inline-block w-9 text-center mr-1 border text-[10px] py-0.5 ${row?.approved ? "bg-foreground text-background border-foreground" : row ? "border-foreground" : "border-border text-muted"}`}>
                                      {locale.toUpperCase()}
                                    </span>
                                  );
                                })
                              : <span className="text-muted">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted">Preenchido = aprovado · contorno = rascunho · cinza = ainda não criado (use “Criar rascunhos padrão”).</p>
        </section>
      )}
    </div>
  );
}
