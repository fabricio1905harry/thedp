import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentCustomer } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/currency";
import { WhatsAppContextSetter, WhatsAppInlineLink } from "@/components/whatsapp-button";
import { OrderPayPanel } from "@/components/order-pay-panel";
import { computeAmountDue, ORDER_CHARGE_COLUMNS } from "@/lib/payments";
import { getSetting } from "@/lib/settings";
import { BUYER_STATUS_KEYS } from "@/lib/order-status";
import type { Currency } from "@/lib/types";
import { OriginalVsConfirmed } from "@/components/original-vs-confirmed";
import { PaymentCanceledLogger } from "@/components/payment-canceled-logger";

function currentTime() {
  return Date.now();
}

export default async function OrderConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; locale: string }>;
  searchParams: Promise<{ paid?: string; payment?: string }>;
}) {
  const { id, locale } = await params;
  const { paid: paidFlag, payment: paymentFlag } = await searchParams;
  const requestedAt = currentTime();
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login");

  const supabase = createServiceRoleClient();
  const t = await getTranslations();
  const tc = await getTranslations("commercial");
  const dateLocale = { pt: "pt-BR", en: "en-US", es: "es-ES" }[locale] ?? locale;

  // The service-role client bypasses RLS, so the order is scoped to the
  // signed-in buyer first; lines/shipment are only read once it matches.
  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .eq("customer_id", customer.id)
    .maybeSingle();

  const [{ data: items }, { data: shipment }, { data: payments }, { data: methods }, bankInstructions] = order
    ? await Promise.all([
        supabase
          .from("order_items")
          .select(`
            id, qty, unit_price, item_status, original_qty, original_unit_price, added_by_tdp,
            variants ( color, size, sku, products ( title, slug ) )
          `)
          .eq("order_id", id),
        supabase.from("shipments").select("*").eq("order_id", id).maybeSingle(),
        supabase
          .from("payments")
          .select(`status, kind, method_code, merchandise_amount, ${ORDER_CHARGE_COLUMNS.join(", ")}`)
          .eq("order_id", id),
        supabase.rpc("available_payment_methods", { p_order_id: id }),
        getSetting<string>("bank_transfer_instructions"),
      ])
    : [{ data: null }, { data: null }, { data: null }, { data: null }, null];

  if (!order) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="font-serif text-2xl">{t("order.notFoundTitle")}</h1>
        <Link href="/" className="text-accent underline text-sm">
          {t("order.backToCatalog")}
        </Link>
      </div>
    );
  }

  const chargesInformed = Boolean(order.charges_informed_at);
  const isRequestStage = ["created", "order_request", "stock_confirmation", "awaiting_buyer_decision"].includes(order.status);
  const statusLabel = BUYER_STATUS_KEYS[order.status] ? t(`order.${BUYER_STATUS_KEYS[order.status]}`) : order.status;
  const holdUntil =
    order.status === "confirmed_awaiting_payment" && order.stock_hold_until
      ? new Date(order.stock_hold_until).toLocaleString(dateLocale, { dateStyle: "medium", timeStyle: "short" })
      : null;

  const holdValid = !order.stock_hold_until || new Date(order.stock_hold_until).getTime() > requestedAt;
  const payOpen =
    Boolean(order.charges_informed_at) &&
    ((order.status === "confirmed_awaiting_payment" && Boolean(order.payment_released_at) && holdValid) ||
      order.status === "reserved");
  const due = payOpen
    ? computeAmountDue(order, (payments ?? []) as unknown as Parameters<typeof computeAmountDue>[1])
    : null;
  const enabledMethods = new Set(
    ((methods ?? []) as { method_code: string; enabled: boolean }[]).filter((m) => m.enabled).map((m) => m.method_code)
  );
  const shippingAddr = (order.shipping_address as Record<string, string>) || {};
  const packagingSnapshot = (order.quote_snapshot as Record<string, unknown>)?.packaging as Record<string, unknown>;
  const packagesList = (packagingSnapshot?.packages as Array<Record<string, unknown>>) || [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 lg:py-16 space-y-10 animate-fade-in-up">
      {/* Top Order Header */}
      <div className="border-b border-border pb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-foreground animate-ping" />
            <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-foreground">
              {isRequestStage ? t("order.requestBadge") : t("order.confirmedBadge")}
            </span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal text-foreground">
            {t("order.orderTitle", { number: order.order_number || order.id.slice(0, 8) })}
          </h1>
          <p className="text-xs text-muted mt-1">
            {t("order.placedOn")} {new Date(order.created_at).toLocaleDateString(dateLocale, { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-accent/10 text-accent border border-accent/20">
            {statusLabel}
          </span>
        </div>
      </div>

      <WhatsAppContextSetter context={{ kind: "order", orderNumber: order.order_number || order.id.slice(0, 8) }} />

      {(holdUntil || order.status === "payment_window_expired" || order.status === "payment_coordination_required") && (
        <div className="border border-border p-4 text-sm space-y-3">
          {holdUntil && <p className="font-semibold">{t("order.inventoryReservedUntil", { date: holdUntil })}</p>}
          {order.status === "payment_window_expired" && <p>{t("order.paymentWindowExpired")}</p>}
          {order.status === "payment_coordination_required" && <p>{t("order.coordinationRequired")}</p>}
          {(order.status === "payment_window_expired" || order.status === "payment_coordination_required") && (
            <WhatsAppInlineLink source="order:contact_to_complete" className="btn-primary inline-block px-4 py-2 text-xs tracking-wider">
              {t("order.contactToComplete")}
            </WhatsAppInlineLink>
          )}
        </div>
      )}

      {paidFlag === "1" && order.status !== "paid" && (
        <div className="border border-border p-4 text-sm bg-surface">{t("order.paymentProcessing")}</div>
      )}

      {paymentFlag === "canceled" && <PaymentCanceledLogger orderId={order.id} />}

      {due && (enabledMethods.has("stripe_card") || enabledMethods.has("bank_transfer")) && (
        <OrderPayPanel
          orderId={order.id}
          locale={locale}
          currency={order.currency as Currency}
          kind={due.kind}
          total={due.total}
          merchandise={due.merchandise}
          charges={Math.round((due.total - due.merchandise) * 100) / 100}
          stripeEnabled={enabledMethods.has("stripe_card")}
          bankEnabled={enabledMethods.has("bank_transfer")}
          bankInstructions={typeof bankInstructions === "string" ? bankInstructions : ""}
          paymentFailed={paymentFlag === "canceled" || paymentFlag === "failed"}
          proofPending={((payments ?? []) as unknown as { status: string; method_code: string }[]).some(
            (p) => p.status === "pending_verification" && p.method_code === "bank_transfer"
          )}
        />
      )}

      {isRequestStage && (
        <div className="border border-foreground p-6 space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.3em]">{t("order.requestReceivedTitle")}</h2>
          <p className="text-sm text-muted leading-relaxed">{t("order.requestReceivedP1")}</p>
          <p className="text-sm text-muted leading-relaxed">{t("order.requestReceivedP2")}</p>
          <p className="text-sm font-medium">{t("order.requestReceivedNoPayment")}</p>
          <p className="text-sm text-muted">{t("order.requestReceivedNotify")}</p>
          <Link href="/minha-conta" className="inline-block mt-2 bg-foreground text-background px-6 py-3 text-[11px] uppercase tracking-[0.2em] font-semibold">
            {t("order.viewMyOrders")}
          </Link>
        </div>
      )}

      {/* DHL Express Shipping Card (only once there is a shipment to show) */}
      {!isRequestStage && (
        <div className="bg-surface border border-gold/40 rounded-sm p-6 space-y-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gold/20 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gold/20 text-gold flex items-center justify-center text-lg font-bold">
                ✈
              </div>
              <div>
                <h3 className="font-serif text-lg font-medium text-foreground">
                  {t("order.shippingCardTitle")}
                </h3>
                <p className="text-xs text-muted">
                  {t("order.modalityLabel")} <strong className="text-foreground">{order.incoterm || "DDU"}</strong> {t("order.priorityFreight")}
                </p>
              </div>
            </div>

            {shipment?.dhl_tracking && (
              <div className="bg-white border border-gold/50 px-4 py-2 rounded-sm shadow-2xs text-right">
                <span className="text-[10px] uppercase tracking-widest text-muted block font-semibold">
                  {t("order.awbCode")}
                </span>
                <span className="font-mono text-sm font-bold text-accent">
                  {shipment.dhl_tracking}
                </span>
              </div>
            )}
          </div>

          {/* Packages Breakdown */}
          {packagesList.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs uppercase tracking-wider font-semibold text-muted">
                {t("order.packagesAutoTitle", { count: packagesList.length })}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {packagesList.map((pkg, idx) => (
                  <div key={idx} className="bg-white/80 border border-border/80 p-3 rounded-xs text-xs space-y-1">
                    <div className="flex justify-between font-medium text-foreground">
                      <span>{String(pkg.packaging_name || t("order.defaultBoxName"))}</span>
                      <span className="text-accent font-semibold">{Number(pkg.final_weight_kg || 0)} kg</span>
                    </div>
                    <p className="text-[11px] text-muted">
                      {t("order.measurementsLabel")} {Number(pkg.length_cm)}x{Number(pkg.width_cm)}x{Number(pkg.height_cm)} cm • {Number(pkg.quantity)} {t("product.pieces")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Labels & Documents */}
          <div className="flex flex-wrap gap-3 pt-2">
            {shipment?.labelUrl && (
              <a
                href={shipment.labelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-xs uppercase tracking-wider font-semibold"
              >
                <span>📄 {t("order.downloadLabel")}</span>
              </a>
            )}
            {shipment?.invoiceUrl && (
              <a
                href={shipment.invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-white border border-border text-foreground hover:border-gold px-5 py-2.5 text-xs uppercase tracking-wider font-medium transition-all rounded-xs shadow-xs"
              >
                <span>📋 {t("order.downloadInvoice")}</span>
              </a>
            )}
          </div>
        </div>
      )}

      {!isRequestStage && (
        <OriginalVsConfirmed
          items={(items ?? []).map((item) => {
            const variant = Array.isArray(item.variants) ? item.variants[0] : item.variants;
            const product = Array.isArray(variant?.products) ? variant?.products[0] : variant?.products;
            return {
              id: item.id,
              title: product?.title || t("order.defaultProductTitle"),
              color: variant?.color ?? null,
              size: variant?.size ?? null,
              qty: item.qty,
              unit_price: Number(item.unit_price),
              item_status: item.item_status,
              original_qty: item.original_qty,
              original_unit_price: item.original_unit_price === null ? null : Number(item.original_unit_price),
              added_by_tdp: Boolean(item.added_by_tdp),
            };
          })}
          totals={{
            currency: order.currency,
            originalSubtotal: order.original_subtotal === null ? null : Number(order.original_subtotal),
            subtotal: Number(order.subtotal),
            chargesInformed,
            shipping: Number(order.shipping_cost ?? 0),
            duties: Number(order.duties_estimate ?? 0),
            other: Number(order.other_charges_amount ?? 0),
            total: Number(order.total),
          }}
        />
      )}

      {/* Grid: Delivery Address & Order Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Delivery Address */}
        <div className="bg-white border border-border/80 p-6 rounded-sm space-y-3">
          <h3 className="text-xs uppercase tracking-[0.2em] font-semibold text-accent border-b border-border/60 pb-2">
            {t("order.deliveryAddressTitle")}
          </h3>
          <div className="text-xs text-foreground space-y-1 font-light leading-relaxed">
            <p className="font-semibold text-sm">{shippingAddr.name || customer.email}</p>
            <p>{shippingAddr.address || shippingAddr.line1}</p>
            <p>{shippingAddr.city}, {shippingAddr.state} {shippingAddr.postalCode || shippingAddr.postal_code}</p>
            <p className="font-medium">{shippingAddr.countryCode || shippingAddr.country || t("order.defaultCountry")}</p>
          </div>
        </div>

        {/* Financial Summary */}
        <div className="bg-white border border-border/80 p-6 rounded-sm space-y-3">
          <h3 className="text-xs uppercase tracking-[0.2em] font-semibold text-accent border-b border-border/60 pb-2">
            {t("order.financialSummaryTitle")}
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted">{t("checkout.subtotalDresses")}</span>
              <span className="font-medium">{formatCurrency(Number(order.subtotal), order.currency)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted">{t("checkout.shippingDhl")}</span>
              <span className="font-medium text-right">
                {chargesInformed ? formatCurrency(Number(order.shipping_cost), order.currency) : t("checkout.toBeInformed")}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted">{t("order.dutiesEstimate")}</span>
              <span className="font-medium text-right">
                {chargesInformed ? formatCurrency(Number(order.duties_estimate), order.currency) : t("checkout.toBeInformed")}
              </span>
            </div>
            {chargesInformed && order.duties_mode && (
              <p className="text-[11px] text-muted">
                {tc("duties.label")} <strong className="text-foreground">{tc(`duties.mode.${order.duties_mode}`)}</strong>
              </p>
            )}
            {chargesInformed && Number(order.other_charges_amount) > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-muted">+</span>
                <span className="font-medium">{formatCurrency(Number(order.other_charges_amount), order.currency)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-border font-serif text-base font-semibold text-foreground">
              <span>
                {!chargesInformed
                  ? t("checkout.totalProducts")
                  : ["paid", "processing", "shipped", "delivered"].includes(order.status)
                    ? t("order.totalPaid")
                    : t("order.orderTotal")}
              </span>
              <span className="text-accent">{formatCurrency(Number(order.total), order.currency)}</span>
            </div>
            {!chargesInformed && (
              <p className="text-[11px] text-muted leading-relaxed">{t("checkout.chargesAfterStockConfirmation")}</p>
            )}
          </div>
        </div>
      </div>

      {/* Ordered Items Table */}
      <div className="bg-white border border-border/80 p-6 rounded-sm space-y-4">
        <h3 className="text-xs uppercase tracking-[0.2em] font-semibold text-accent border-b border-border/60 pb-3">
          {t("order.itemsConfirmedTitle", { count: items?.length ?? 0 })}
        </h3>
        <div className="divide-y divide-border/60">
          {(items ?? []).map((item) => {
            const variant = Array.isArray(item.variants) ? item.variants[0] : item.variants;
            const product = Array.isArray(variant?.products) ? variant?.products[0] : variant?.products;
            const inactive = item.item_status !== "available" && item.item_status !== "requested";
            const priceChanged =
              item.original_unit_price !== null && Number(item.original_unit_price) !== Number(item.unit_price);
            return (
              <div key={item.id} className={`py-3 flex items-center justify-between text-xs ${inactive ? "opacity-60" : ""}`}>
                <div>
                  <h4 className={`font-serif text-sm font-medium text-foreground ${inactive ? "line-through" : ""}`}>
                    {product?.title || t("order.defaultProductTitle")}
                  </h4>
                  <p className="text-[11px] text-muted">
                    {t("checkout.colorLabel")} {variant?.color} • {t("order.sizeFullLabel")} {variant?.size} • {t("checkout.qtyLabel")} {item.qty}
                    {item.original_qty !== null && item.original_qty !== item.qty ? ` (${t("order.itemWas")} ${item.original_qty})` : ""}
                  </p>
                  {inactive && (
                    <p className="text-[11px] font-semibold text-accent">
                      {item.item_status === "removed" ? t("order.itemRemoved") : t("order.itemUnavailable")}
                    </p>
                  )}
                  {item.added_by_tdp && !inactive && <p className="text-[11px] text-muted">{t("order.itemAdded")}</p>}
                </div>
                <div className="text-right font-medium">
                  {inactive ? (
                    <span className="line-through">{formatCurrency(Number(item.unit_price) * item.qty, order.currency)}</span>
                  ) : (
                    formatCurrency(Number(item.unit_price) * item.qty, order.currency)
                  )}
                  {priceChanged && !inactive && (
                    <span className="block text-[10px] text-muted line-through">
                      {formatCurrency(Number(item.original_unit_price) * item.qty, order.currency)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions Footer */}
      <div className="text-center pt-4">
        <Link
          href="/"
          className="btn-primary inline-flex items-center gap-2 px-8 py-3.5 text-xs uppercase tracking-[0.2em] font-semibold"
        >
          <span>{t("order.continueBrowsing")}</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}
