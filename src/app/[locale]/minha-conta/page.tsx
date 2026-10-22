import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/currency";
import { BUYER_STATUS_KEYS } from "@/lib/order-status";
import type { Currency } from "@/lib/types";

/** My account: order history (Original Request → Confirmed Order → paid → shipped). */
export default async function MyAccountPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login");

  const locale = await getLocale();
  const t = await getTranslations("account");
  const tOrder = await getTranslations("order");
  const tFav = await getTranslations("c2.favorites");
  const supabase = await createClient();
  const { data: application } = await supabase
    .from("customers")
    .select("status, review_note")
    .eq("id", customer.id)
    .maybeSingle();
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, status, currency, total, created_at")
    .order("created_at", { ascending: false });
  const dateLocale = { pt: "pt-BR", en: "en-US", es: "es-ES" }[locale] ?? locale;

  return (
    <div className="max-w-4xl mx-auto px-4 py-14 sm:py-20">
      <h1 className="font-serif text-4xl">{t("title")}</h1>
      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted">{customer.email}</p>

      {application && application.status !== "approved" && (
        <section className="mt-10 border border-border p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted mb-3">{t("appStatusTitle")}</h2>
          {application.status === "more_info" ? (
            <>
              <p className="text-sm">{t("appMoreInfo")}</p>
              {application.review_note && <p className="mt-3 text-sm border-l-2 border-foreground pl-3 whitespace-pre-line">{application.review_note}</p>}
              <Link href="/contato?subject=registration" className="mt-4 inline-block bg-foreground text-background px-5 py-2.5 text-[11px] uppercase tracking-[0.2em] font-semibold">
                {t("appReply")}
              </Link>
            </>
          ) : application.status === "rejected" ? (
            <p className="text-sm">{t("appRejected")}</p>
          ) : (
            <p className="text-sm">{t("appPending")}</p>
          )}
        </section>
      )}

      <p className="mt-8">
        <Link href="/minha-conta/favoritos" className="text-[11px] font-semibold uppercase tracking-[0.2em] underline underline-offset-4">
          {tFav("title")}
        </Link>
      </p>

      <section className="mt-12">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted mb-4">{t("orders")}</h2>
        {(orders ?? []).length === 0 ? (
          <p className="text-sm text-muted border border-dashed border-border p-6">
            {t("noOrders")}{" "}
            <Link href="/shop" className="underline text-foreground">
              {t("browse")}
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {(orders ?? []).map((o) => (
              <li key={o.id}>
                <Link href={`/pedidos/${o.id}`} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-4 hover:bg-surface px-2 transition-colors">
                  <span className="font-medium text-sm">#{o.order_number ?? o.id.slice(0, 8)}</span>
                  <span className="text-xs text-muted">{new Date(o.created_at).toLocaleDateString(dateLocale)}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.15em]">
                    {BUYER_STATUS_KEYS[o.status] ? tOrder(BUYER_STATUS_KEYS[o.status]) : o.status}
                  </span>
                  <span className="text-sm">{formatCurrency(Number(o.total), o.currency as Currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-10 text-sm">
        <Link href="/minha-conta/enderecos" className="underline">
          {t("addresses")}
        </Link>
      </p>
    </div>
  );
}
