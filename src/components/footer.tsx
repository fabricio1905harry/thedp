import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { SiteMode } from "@/lib/site-mode";

export function Footer({ siteMode, signedIn = false }: { siteMode: SiteMode; signedIn?: boolean }) {
  const t = useTranslations("footer");
  const isNacional = siteMode === "nacional";

  return (
    <footer className="border-t border-border mt-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-2 md:grid-cols-4 gap-10 text-sm">
        <div className="col-span-2 md:col-span-1">
          <Image src="/brand/logo-vertical.png" alt="The Dressing Project" width={1190} height={606} className="h-16 w-auto" />
          <p className="mt-4 text-xs text-muted leading-relaxed max-w-[16rem]">{t("tagline")}</p>
        </div>
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] mb-4">{t("explore")}</h3>
          <ul className="space-y-2.5 text-muted">
            <li><Link href="/shop" className="hover:text-foreground">{t("shop")}</Link></li>
            <li><Link href="/sobre" className="hover:text-foreground">{t("about")}</Link></li>
            <li><Link href="/contato" className="hover:text-foreground">{t("contact")}</Link></li>
            <li><Link href="/faq" className="hover:text-foreground">{t("faq")}</Link></li>
          </ul>
        </div>
        {!isNacional && (
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] mb-4">{t("wholesale")}</h3>
            <ul className="space-y-2.5 text-muted">
              {!signedIn && <li><Link href="/cadastro" className="hover:text-foreground">{t("createAccount")}</Link></li>}
              {!signedIn && <li><Link href="/login" className="hover:text-foreground">{t("signIn")}</Link></li>}
              <li><Link href="/minha-conta" className="hover:text-foreground">{signedIn ? t("myAccount") : t("myOrders")}</Link></li>
              <li><Link href="/reserve-for-later-delivery" className="hover:text-foreground">{t("reserveLater")}</Link></li>
            </ul>
          </div>
        )}
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] mb-4">{t("policies")}</h3>
          <ul className="space-y-2.5 text-muted">
            <li><Link href="/politicas/termos" className="hover:text-foreground">{t("terms")}</Link></li>
            <li><Link href="/politicas/privacidade" className="hover:text-foreground">{t("privacy")}</Link></li>
            <li><Link href="/politicas/trocas" className="hover:text-foreground">{t("returns")}</Link></li>
          </ul>
        </div>
      </div>
      {isNacional && <div className="bg-surface text-center text-xs py-3 px-4 border-t border-border">{t("nationalNotice")}</div>}
      <div className="text-center text-[11px] uppercase tracking-[0.2em] text-muted py-5 border-t border-border">
        © The Dressing Project {new Date().getFullYear()}
      </div>
    </footer>
  );
}
