import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { MegaMenu } from "@/components/mega-menu";
import { CartLink } from "@/components/cart-link";
import { MobileNav } from "@/components/mobile-nav";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { CurrencySwitcher } from "@/components/currency-switcher";
import { AccountMenu } from "@/components/account-menu";
import { getAllCategories } from "@/lib/catalog";
import { mainNav } from "@/lib/nav";
import { getNavAvailability } from "@/lib/catalog-extra";
import type { SiteMode } from "@/lib/site-mode";
import { getCurrentCustomer } from "@/lib/auth";
import { getPublicBlock } from "@/lib/cms";
import { operationForSiteMode } from "@/lib/cms-types";
import { CmsLink } from "@/components/cms-link";
import { logoutAction } from "@/app/[locale]/login/actions";

const NAV_LINK =
  "text-[11px] font-semibold uppercase tracking-[0.2em] py-5 text-foreground hover:text-muted transition-colors";

type Bar = Record<string, unknown> | null;

async function barBlocks(siteMode: SiteMode) {
  const locale = await getLocale();
  const op = operationForSiteMode(siteMode);
  const [announcement, national_notice] = await Promise.all([
    getPublicBlock("site", "announcement", op, locale).catch(() => ({})),
    getPublicBlock("site", "national_notice", op, locale).catch(() => ({})),
  ]);
  return { announcement, national_notice };
}

function barText(bar: Bar, fallback: string) {
  const text = bar && typeof bar.text === "string" && bar.text ? bar.text : fallback;
  const link = bar && typeof bar.link === "string" ? bar.link : "";
  return link ? <CmsLink href={link} className="hover:underline">{text}</CmsLink> : text;
}

export async function Header({ siteMode }: { siteMode: SiteMode }) {
  const t = await getTranslations("nav");
  const tFooter = await getTranslations("footer");
  const categories = await getAllCategories().catch(() => [] as string[]);
  const customer = await getCurrentCustomer();
  const isNacional = siteMode === "nacional";
  const bars = await barBlocks(siteMode);
  // BRANDS / COLLECTIONS / LOOKBOOKS / EDITS show only when at least one active entry is visible
  const available = await getNavAvailability();
  const items = mainNav(available).map((entry) => ({ ...entry, label: t(entry.key) }));

  return (
    <header className="bg-background border-b border-border sticky top-0 z-30">
      {/* The bar is hidden when the block is turned OFF in Admin → Conteúdo (null = OFF / not for this operation). */}
      {isNacional
        ? bars.national_notice && (
            <div className="bg-surface text-center text-xs py-2 px-4 border-b border-border font-medium">{barText(bars.national_notice, tFooter("nationalNotice"))}</div>
          )
        : bars.announcement && (
            <div className="bg-foreground text-background text-center text-[10px] sm:text-[11px] uppercase tracking-[0.25em] py-2 px-4">
              {barText(bars.announcement, t("announcement"))}
            </div>
          )}

      {/* Row 1: menu button + logo | controls. Row 2 (below xl): the menu links. One row from xl.
          Nothing overlaps at any width: the logo never shrinks and the controls hide before they collide. */}
      <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-x-4">
        <div className="flex items-center gap-3 shrink-0">
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
              myAccount: t("myAccount"),
            }}
            items={items}
            categories={categories}
            showAccount={!isNacional}
            customer={customer}
            showCurrency={!isNacional}
          />
          <Link href="/" className="py-3.5 shrink-0 transition-opacity hover:opacity-80">
            <Image src="/brand/logo-horizontal.png" alt="The Dressing Project" width={1190} height={117} priority className="h-5 sm:h-6 w-auto max-w-none shrink-0" />
          </Link>
        </div>

        <nav className="hidden md:flex order-3 w-full justify-center gap-6 border-t border-border/60 xl:order-none xl:w-auto xl:flex-1 xl:border-0 xl:gap-8">
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

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-2 sm:gap-3">
            <LocaleSwitcher />
            {!isNacional && <CurrencySwitcher />}
          </div>
          {!isNacional &&
            (customer ? (
              <div className="hidden md:block">
                <AccountMenu
                  labels={{ account: t("myAccount"), accountMenu: t("accountMenu"), myOrders: t("myOrders"), sair: t("sair") }}
                  logout={logoutAction}
                />
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-3">
                <Link href="/login" className="text-[11px] font-semibold uppercase tracking-[0.15em] hover:text-muted">
                  {t("login")}
                </Link>
                <Link href="/cadastro" className="btn-primary text-[11px] uppercase tracking-[0.15em] font-semibold px-4 py-2">
                  {t("cadastro")}
                </Link>
              </div>
            ))}
          {!isNacional && <CartLink signedIn={Boolean(customer)} />}
        </div>
      </div>
    </header>
  );
}
