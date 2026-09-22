import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { SiteMode } from "@/lib/site-mode";

export function Footer({ siteMode }: { siteMode: SiteMode }) {
  const t = useTranslations("footer");

  return (
    <footer className="border-t border-border mt-16">
      <div className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
        <div>
          <Image
            src="/brand/logo-vertical.png"
            alt="The Dressing Project"
            width={1190}
            height={606}
            className="h-16 w-auto"
          />
        </div>
        <div>
          <h3 className="font-medium mb-3">{t("institutional")}</h3>
          <ul className="space-y-2 text-muted">
            <li><Link href="/sobre" className="hover:text-accent">{t("about")}</Link></li>
            <li><Link href="/faq" className="hover:text-accent">{t("faq")}</Link></li>
            <li><Link href="/contato" className="hover:text-accent">{t("contact")}</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="font-medium mb-3">{t("policies")}</h3>
          <ul className="space-y-2 text-muted">
            <li><Link href="/politicas/termos" className="hover:text-accent">{t("terms")}</Link></li>
            <li><Link href="/politicas/privacidade" className="hover:text-accent">{t("privacy")}</Link></li>
            <li><Link href="/politicas/trocas" className="hover:text-accent">{t("returns")}</Link></li>
          </ul>
        </div>
      </div>
      {siteMode === "nacional" && (
        <div className="bg-surface text-center text-xs py-3 px-4 border-t border-border">
          {t("nationalNotice")}
        </div>
      )}
      <div className="text-center text-xs text-muted py-4">
        The Dressing Project {new Date().getFullYear()}
      </div>
    </footer>
  );
}
