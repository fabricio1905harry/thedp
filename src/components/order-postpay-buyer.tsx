import { getTranslations } from "next-intl/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/currency";
import type { Currency } from "@/lib/types";

interface OrderLike {
  id: string;
  status: string;
  currency: string;
  total: number | string;
  payment_mode: string;
  reserve_amount: number | string | null;
  reserve_stage: string | null;
  reserve_desired_delivery_date: string | null;
  reserve_balance_due_date: string | null;
  reserve_expires_at: string | null;
}

/**
 * Buyer-facing post-payment blocks of the order page: Reserve schedule and
 * balance, shipment tracking timeline, invoice download. The order is
 * already verified to belong to the signed-in buyer by the page; nothing
 * about suppliers or stock is exposed. MOCK shipments are never shown.
 */
export async function OrderPostPayBuyer({ order, locale }: { order: OrderLike; locale: string }) {
  const t = await getTranslations("postpay");
  const dateLocale = ({ pt: "pt-BR", en: "en-US", es: "es-ES" } as Record<string, string>)[locale] ?? locale;
  const supabase = createServiceRoleClient();
  const fmtDate = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString(dateLocale, { day: "2-digit", month: "long", year: "numeric" }) : null);
  const money = (n: number) => formatCurrency(n, order.currency as Currency);

  const [{ data: shipment }, { data: invoice }] = await Promise.all([
    supabase.from("shipments").select("id, status, dhl_tracking, tracking_url, is_mock, carrier").eq("order_id", order.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("invoices").select("id, number").eq("order_id", order.id).eq("status", "issued").maybeSingle(),
  ]);
  const visibleShipment = shipment && !shipment.is_mock ? shipment : null;
  const { data: events } = visibleShipment
    ? await supabase.from("shipment_events").select("id, status, description, location, occurred_at").eq("shipment_id", visibleShipment.id).order("occurred_at", { ascending: false })
    : { data: [] };
  const { data: docs } = visibleShipment
    ? await supabase.from("shipment_documents").select("id, file_name").eq("shipment_id", visibleShipment.id).eq("visible_to_buyer", true)
    : { data: [] };

  const showReserve = order.payment_mode === "reserve" && order.reserve_stage;
  const deposit = Number(order.reserve_amount ?? 0);
  const balance = Math.max(0, Math.round((Number(order.total) - deposit) * 100) / 100);
  const paidInFull = ["paid", "processing", "shipped", "delivered"].includes(order.status);

  if (!showReserve && !visibleShipment && !invoice) return null;

  return (
    <div className="space-y-8">
      {showReserve && (
        <section className="border border-foreground p-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.3em]">{t("reserveTitle")}</h2>
            <span className="text-[10px] font-semibold uppercase tracking-wider border border-foreground px-2 py-0.5">
              {t(`reserveStage_${order.reserve_stage}`)}
            </span>
          </div>
          <dl className="grid sm:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted">{t("reserveDeposit")}</dt>
              <dd className="font-medium">{money(deposit)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t("reserveBalance")}</dt>
              <dd className="font-medium">{paidInFull ? t("reservePaid") : money(balance)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t("reserveDesiredDelivery")}</dt>
              <dd className="font-medium">{fmtDate(order.reserve_desired_delivery_date) ?? t("reserveNotSet")}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t("reserveBalanceDue")}</dt>
              <dd className="font-medium">{fmtDate(order.reserve_balance_due_date) ?? t("reserveNotSet")}</dd>
            </div>
          </dl>
          {order.reserve_stage === "overdue" && <p className="text-sm font-semibold">{t("reserveOverdueNote")}</p>}
          {order.reserve_stage === "expired" && <p className="text-sm font-semibold">{t("reserveExpiredNote")}</p>}
          {order.reserve_expires_at && !paidInFull && (
            <p className="text-xs text-muted">{t("reserveWindowUntil", { date: fmtDate(order.reserve_expires_at) ?? "" })}</p>
          )}
          <p className="text-xs text-muted">{t("reserveShipNote")}</p>
        </section>
      )}

      {visibleShipment && (
        <section className="border border-border p-6 space-y-4 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.3em]">{t("trackingTitle")}</h2>
            <span className="text-[10px] font-semibold uppercase tracking-wider border border-foreground px-2 py-0.5">{t(`shipStatus_${visibleShipment.status}`)}</span>
          </div>
          {visibleShipment.dhl_tracking && (
            <p className="text-sm">
              {t("trackingNumber")}: <span className="font-mono font-semibold">{visibleShipment.dhl_tracking}</span>
              {visibleShipment.tracking_url && (
                <>
                  {" · "}
                  <a href={visibleShipment.tracking_url} target="_blank" rel="noopener noreferrer" className="underline">
                    {t("trackParcel")}
                  </a>
                </>
              )}
            </p>
          )}
          <ol className="space-y-2 text-sm border-l border-border pl-4">
            {(events ?? []).length === 0 && <li className="text-muted">{t("noEvents")}</li>}
            {(events ?? []).map((e) => (
              <li key={e.id}>
                <span className="text-xs text-muted block">{new Date(e.occurred_at).toLocaleString(dateLocale, { dateStyle: "medium", timeStyle: "short" })}</span>
                <span className="font-medium">{t(`shipStatus_${e.status}`)}</span>
                {e.location ? <span className="text-muted"> · {e.location}</span> : null}
              </li>
            ))}
          </ol>
          {(docs ?? []).map((d) => (
            <a key={d.id} href={`/api/documents/shipment/${d.id}`} className="block text-sm underline">
              {d.file_name}
            </a>
          ))}
        </section>
      )}

      {invoice && (
        <section className="border border-border p-6 bg-white flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.3em]">{t("invoiceTitle")}</h2>
            <p className="text-sm text-muted mt-1">{invoice.number}</p>
          </div>
          <a href={`/api/documents/invoice/${invoice.id}`} className="btn-primary inline-block px-5 py-2.5 text-xs uppercase tracking-wider font-semibold">
            {t("invoiceDownload")}
          </a>
        </section>
      )}
    </div>
  );
}
