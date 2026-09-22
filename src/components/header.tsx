import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { MegaMenu } from "@/components/mega-menu";
import { CartLink } from "@/components/cart-link";
import { MobileNav } from "@/components/mobile-nav";
import { getAllCategories } from "@/lib/catalog";
import type { SiteMode } from "@/lib/site-mode";

import { getCurrentCustomer } from "@/lib/auth";
import { logoutAction } from "@/app/[locale]/login/actions";

export async function Header({ siteMode }: { siteMode: SiteMode }) {
  const t = await getTranslations();
  const categories = await getAllCategories();
  const customer = await getCurrentCustomer();
  const isNacional = siteMode === "nacional";

  return (
    <header className="glass-panel border-b border-border/80 sticky top-0 z-30 transition-all duration-300">
      {isNacional && (
        <div className="bg-surface/80 text-center text-xs py-2 px-4 border-b border-border/60 font-medium">
          {t("footer.nationalNotice")}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <MobileNav
            labels={{
              novidades: t("nav.novidades"),
              destaques: t("nav.destaques"),
              colecoes: t("nav.colecoes"),
              atacado: t("nav.atacado"),
              sobre: t("nav.sobre"),
              login: t("nav.login"),
              cadastro: t("nav.cadastro"),
              sair: t("nav.sair"),
              statusApproved: t("nav.statusApproved"),
              statusPending: t("nav.statusPending"),
              statusRejected: t("nav.statusRejected"),
            }}
            categories={categories}
            siteMode={siteMode}
            customer={customer}
          />
          <Link href="/" className="py-3.5 shrink-0 transition-opacity hover:opacity-90">
            <Image
              src="/brand/logo-horizontal.png"
              alt="The Dressing Project"
              width={1190}
              height={117}
              priority
              className="h-6 w-auto"
            />
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-7">
          <Link href="/" className="text-xs font-semibold uppercase tracking-[0.15em] py-4 text-foreground/90 hover:text-accent hover-underline-link transition-colors">
            {t("nav.novidades")}
          </Link>
          <Link href="/" className="text-xs font-semibold uppercase tracking-[0.15em] py-4 text-foreground/90 hover:text-accent hover-underline-link transition-colors">
            {t("nav.destaques")}
          </Link>
          <MegaMenu label={t("nav.colecoes")} categories={categories} />
          {!isNacional && (
            <Link href="/atacado" className="text-xs font-semibold uppercase tracking-[0.15em] py-4 text-foreground/90 hover:text-accent hover-underline-link transition-colors">
              {t("nav.atacado")}
            </Link>
          )}
          <Link href="/sobre" className="text-xs font-semibold uppercase tracking-[0.15em] py-4 text-foreground/90 hover:text-accent hover-underline-link transition-colors">
            {t("nav.sobre")}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {!isNacional && <CartLink />}
          {!isNacional && (
            <>
              {customer ? (
                <div className="hidden md:flex items-center gap-3">
                  <Link
                    href="/minha-conta/enderecos"
                    className="flex items-center gap-2 group text-xs text-muted hover:text-accent"
                  >
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                        customer.status === "approved"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300"
                          : customer.status === "pending"
                          ? "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300"
                          : "bg-red-50 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300"
                      }`}
                    >
                      {customer.status === "approved"
                        ? t("nav.statusApproved")
                        : customer.status === "pending"
                        ? t("nav.statusPending")
                        : t("nav.statusRejected")}
                    </span>
                    <span className="hidden lg:inline truncate max-w-[140px]" title={customer.email}>
                      {customer.email}
                    </span>
                  </Link>

                  <form action={logoutAction}>
                    <button
                      type="submit"
                      className="text-xs text-muted hover:text-accent border border-border px-2.5 py-1 transition-colors"
                    >
                      {t("nav.sair")}
                    </button>
                  </form>
                </div>
              ) : (
                <>
                  <Link href="/login" className="text-sm hover:text-accent hidden sm:inline">
                    {t("nav.login")}
                  </Link>
                  <Link
                    href="/cadastro"
                    className="text-sm bg-accent text-white px-4 py-2 hover:opacity-90 transition-opacity"
                  >
                    {t("nav.cadastro")}
                  </Link>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
