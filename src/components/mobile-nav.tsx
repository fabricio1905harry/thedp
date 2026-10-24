"use client";

import { useState } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import type { CurrentCustomer } from "@/lib/auth";
import { logoutAction } from "@/app/[locale]/login/actions";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { CurrencySwitcher } from "@/components/currency-switcher";

export interface MobileNavLabels {
  menu: string;
  close: string;
  shop: string;
  allProducts: string;
  login: string;
  cadastro: string;
  sair: string;
  myOrders: string;
  myAccount: string;
}

export function MobileNav({
  labels,
  items,
  categories,
  showAccount,
  customer,
  showCurrency = false,
}: {
  labels: MobileNavLabels;
  items: { key: string; label: string; href: string }[];
  categories: string[];
  showAccount: boolean;
  customer?: CurrentCustomer | null;
  /** international site: USD/EUR selector inside the menu */
  showCurrency?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="md:hidden">
      <button aria-label={labels.menu} aria-expanded={open} onClick={() => setOpen(true)} className="w-9 h-9 flex items-center justify-center border border-border">
        ☰
      </button>

      {open && (
        <div className="fixed inset-0 bg-background z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <Image src="/brand/logo-horizontal.png" alt="The Dressing Project" width={1190} height={117} className="h-6 w-auto" />
            <button aria-label={labels.close} onClick={close} className="w-9 h-9 flex items-center justify-center border border-border">
              ✕
            </button>
          </div>

          <nav className="flex flex-col divide-y divide-border overflow-y-auto flex-1">
            {customer && (
              <div className="p-4 bg-surface flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold truncate max-w-[200px]">{customer.email}</p>
                </div>
                <form action={logoutAction}>
                  <button type="submit" onClick={close} className="text-xs border border-border px-3 py-1.5 font-medium">
                    {labels.sair}
                  </button>
                </form>
              </div>
            )}

            {items.map((item) =>
              item.key === "shop" ? (
                <div key="shop">
                  <MobileLink href="/shop" onClick={close}>
                    {labels.shop}
                  </MobileLink>
                  <ul className="pb-3 pl-8 pr-4 -mt-2 space-y-2">
                    <li>
                      <Link href="/shop" onClick={close} className="text-sm text-muted">
                        {labels.allProducts}
                      </Link>
                    </li>
                    {categories.map((category) => (
                      <li key={category}>
                        <Link href={`/shop?category=${encodeURIComponent(category)}`} onClick={close} className="text-sm text-muted">
                          {category}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <MobileLink key={item.key} href={item.href} onClick={close}>
                  {item.label}
                </MobileLink>
              )
            )}

            {showAccount && customer && (
              <>
                <MobileLink href="/minha-conta" onClick={close}>
                  {labels.myAccount}
                </MobileLink>
                <MobileLink href="/minha-conta#pedidos" onClick={close}>
                  {labels.myOrders}
                </MobileLink>
              </>
            )}
            {showAccount && !customer && (
              <>
                <MobileLink href="/login" onClick={close}>
                  {labels.login}
                </MobileLink>
                <MobileLink href="/cadastro" onClick={close}>
                  {labels.cadastro}
                </MobileLink>
              </>
            )}
          </nav>
          {/* language and currency stay reachable on small screens */}
          <div className="shrink-0 border-t border-border p-4 flex items-center gap-3">
            <LocaleSwitcher />
            {showCurrency && <CurrencySwitcher />}
          </div>
        </div>
      )}
    </div>
  );
}

function MobileLink({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link href={href} onClick={onClick} className="block px-4 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] hover:text-muted">
      {children}
    </Link>
  );
}
