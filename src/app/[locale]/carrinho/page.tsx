"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCart } from "@/components/cart-provider";
import { useCurrency } from "@/components/currency-provider";
import { formatCurrency, pickPrice } from "@/lib/currency";

export default function CartPage() {
  const t = useTranslations("cart");
  const { items, setQty, removeItem } = useCart();
  const { currency } = useCurrency();

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-14 text-center">
        <h1 className="font-serif text-3xl mb-4">{t("empty")}</h1>
        <Link href="/" className="text-sm text-accent underline">
          {t("browseCatalog")}
        </Link>
        <p className="mt-4 text-sm">
          <Link href="/minha-conta" className="underline">
            {t("viewMyOrders")}
          </Link>
        </p>
      </div>
    );
  }

  const subtotal = items.reduce((sum, item) => {
    const picked = pickPrice(item.pricing, currency);
    return sum + (picked?.amount ?? 0) * item.qty;
  }, 0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-14">
      <h1 className="font-serif text-3xl mb-8">{t("title")}</h1>

      <div className="divide-y divide-border border-y border-border">
        {items.map((item) => {
          const picked = pickPrice(item.pricing, currency);
          return (
            <div key={item.variantId} className="flex items-center gap-4 py-4">
              <div className="flex-1">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted">
                  {item.color} · {item.size}
                </p>
              </div>
              <input
                type="number"
                min={1}
                value={item.qty}
                onChange={(e) => setQty(item.variantId, Number(e.target.value))}
                className="w-16 border border-border px-2 py-1 text-sm text-center"
              />
              <p className="w-24 text-right text-sm">
                {picked ? formatCurrency(picked.amount * item.qty, picked.currency) : "—"}
              </p>
              <button
                onClick={() => removeItem(item.variantId)}
                className="text-xs text-muted hover:text-accent"
                aria-label={t("remove")}
              >
                {t("remove")}
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center mt-6">
        <p className="text-sm text-muted">{t("subtotalNotice")}</p>
        <p className="text-lg font-semibold">{formatCurrency(subtotal, currency)}</p>
      </div>

      <div className="mt-6 border border-border bg-surface p-4 space-y-2 text-xs leading-relaxed">
        <p className="font-semibold uppercase tracking-[0.15em]">{t("availabilityNote")}</p>
        <p className="text-muted">{t("chargesNote")}</p>
        <p className="text-muted">{t("quantityNote")}</p>
      </div>

      <Link
        href="/checkout"
        className="btn-primary block text-center mt-8 py-3 text-sm uppercase tracking-wide font-medium"
      >
        {t("proceedToCheckout")}
      </Link>
      <p className="mt-4 text-center text-[11px] text-muted leading-relaxed">
        {t("reserveHint")}{" "}
        <Link href="/reserve-for-later-delivery" className="underline">
          {t("reserveLearn")}
        </Link>
      </p>
    </div>
  );
}
