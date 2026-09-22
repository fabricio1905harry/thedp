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

      <Link
        href="/checkout"
        className="block text-center mt-8 bg-accent text-white py-3 text-sm uppercase tracking-wide hover:opacity-90 font-medium"
      >
        {t("proceedToCheckout")}
      </Link>
    </div>
  );
}
