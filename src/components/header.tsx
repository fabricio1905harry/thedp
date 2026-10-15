import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { MegaMenu } from "@/components/mega-menu";
import { CartLink } from "@/components/cart-link";
import { MobileNav } from "@/components/mobile-nav";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { getAllCategories } from "@/lib/catalog";
import { mainNav, statusKey } from "@/lib/nav";
import type { SiteMode } from "@/lib/site-mode";
import { getCurrentCustomer } from "@/lib/auth";
import { logoutAction } from "@/app/[locale]/login/actions";

const NAV_LINK =
  "text-[11px] font-semibold uppercase tracking-[0.2em] py-5 text-foreground hover:text-muted transition-colors";

export async function Header({ siteMode }: { siteMode: SiteMode }) {
  const t = await getTranslations("nav");
  const tFooter = await getTranslations("footer");
  const categories = await getAllCategories().catch(() => [] as string[]);
  const customer = await getCurrentCustomer();
  const isNacional = siteMode === "nacional";
  const items = mainNav().map((entry) => ({ ...entry, label: t(entry.key) }));

  return (
    <header className="bg-background border-b border-border sticky top-0 z-30">
      {isNacional ? (
        <div className="bg-surface text-center text-xs py-2 px-4 border-b border-border font-medium">{tFooter("nationalNotice")}</div>
      ) : (
        <div className="bg-foreground text-background text-center text-[10px] sm:text-[11px] uppercase tracking-[0.25em] py-2 px-4">
          {t("announcement")}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <MobileNav
            labels={{
              menu: t("menu"),
              close: t("close"),
              shop: t("shop"),
              allProducts: t("allProducts"),
              login: t("login"),
              cadastro: t("cadastro"),
              sair: t("sair"),
              myOrders: t("myOrders"),
              status: customer ? t(statusKey(customer.status)) : "",
            }}
            items={items}
            categories={categories}
            showAccount={!isNacional}
            customer={customer}
          />
          <Link href="/" className="py-3.5 shrink-0 transition-opacity hover:opacity-80">
            <Image src="/brand/logo-horizontal.png" alt="The Dressing Project" width={1190} height={117} priority className="h-6 w-auto" />
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-8">
          {items.map((item) =>
            item.key === "shop" ? (
              <MegaMenu key="shop" label={item.label} allLabel={t("allProducts")} categories={categories} />
            ) : (
              <Link key={item.key} href={item.href} className={NAV_LINK}>
                {item.label}
              </Link>
            )
          )}
        </nav>

        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          {!isNacional && <CartLink />}
          {!isNacional &&
            (customer ? (
              <div className="hidden md:flex items-center gap-3">
                <Link href="/minha-conta" className="flex items-center gap-2 text-xs text-muted hover:text-foreground">
                  <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider border border-foreground text-foreground">
                    {t(statusKey(customer.status))}
                  </span>
                  <span className="hidden xl:inline truncate max-w-[140px]" title={customer.email}>
                    {t("myOrders")}
                  </span>
                </Link>
                <form action={logoutAction}>
                  <button type="submit" className="text-xs text-muted hover:text-foreground border border-border px-2.5 py-1 transition-colors">
                    {t("sair")}
                  </button>
                </form>
              </div>
            ) : (
              <>
                <Link href="/login" className="text-[11px] font-semibold uppercase tracking-[0.15em] hover:text-muted hidden sm:inline">
                  {t("login")}
                </Link>
                <Link href="/cadastro" className="btn-primary text-[11px] uppercase tracking-[0.15em] font-semibold px-4 py-2 hidden sm:inline-block">
                  {t("cadastro")}
                </Link>
              </>
            ))}
        </div>
      </div>
    </header>
  );
}
