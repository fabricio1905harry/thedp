"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCart } from "@/components/cart-provider";

export function CartLink() {
  const t = useTranslations("cart");
  const { count } = useCart();

  return (
    <Link href="/carrinho" className="relative text-sm hover:text-accent font-medium uppercase tracking-wide" aria-label={t("cartLink")}>
      {t("cartLink")}
      {count > 0 && (
        <span className="absolute -top-2 -right-3 bg-accent text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
          {count}
        </span>
      )}
    </Link>
  );
}
