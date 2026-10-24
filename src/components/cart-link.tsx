"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCart } from "@/components/cart-provider";

/**
 * Shopping bag with the number of UNITS in the order request (sum of quantities,
 * not lines). With items → the order request (cart). Signed in with an empty
 * cart → My account orders (never an empty cart page).
 */
export function CartLink({ signedIn = false }: { signedIn?: boolean }) {
  const t = useTranslations("cart");
  const { count } = useCart();
  const href = count === 0 && signedIn ? "/minha-conta" : "/carrinho";
  const label = count > 0 ? `${t("bagLabel")} (${count})` : t("bagLabel");

  return (
    <Link href={href} className="relative inline-flex h-9 w-9 items-center justify-center hover:text-muted transition-colors" aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]" aria-hidden="true">
        <path d="M5 8h14l-1 12H6L5 8Z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-foreground text-background text-[10px] font-semibold leading-[18px] text-center">
          {count}
        </span>
      )}
    </Link>
  );
}
