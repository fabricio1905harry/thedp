"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCart } from "@/components/cart-provider";

/** With items → the order request (cart). Signed in with an empty cart → My account orders (never an empty cart page). */
export function CartLink({ signedIn = false }: { signedIn?: boolean }) {
  const t = useTranslations("cart");
  const { count } = useCart();

  const toOrders = signedIn && count === 0;
  const label = toOrders ? t("myOrdersLink") : t("cartLink");

  return (
    <Link href={toOrders ? "/minha-conta" : "/carrinho"} className="relative text-[11px] font-semibold uppercase tracking-[0.15em] hover:text-muted" aria-label={label}>
      {label}
      {count > 0 && (
        <span className="absolute -top-2 -right-3 bg-accent text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
          {count}
        </span>
      )}
    </Link>
  );
}
