"use client";

import { useTranslations } from "next-intl";

export function BenefitsBanner({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("benefits");

  if (compact) {
    return (
      <div className="mt-8 border-t border-border pt-6 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0 text-sm font-semibold">
            ✈
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide">{t("shippingTitle")}</p>
            <p className="text-xs text-muted mt-0.5 leading-relaxed">{t("shipping")}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0 text-sm font-semibold">
            💳
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide">{t("installmentsTitle")}</p>
            <p className="text-xs text-muted mt-0.5 leading-relaxed">{t("installments")}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0 text-sm font-semibold">
            🌐
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide">{t("supportTitle")}</p>
            <p className="text-xs text-muted mt-0.5 leading-relaxed">{t("support")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="py-12 bg-surface/50 border-y border-border">
      <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="flex items-center gap-4 p-5 rounded-lg border border-border/60 bg-background/60 backdrop-blur-sm shadow-sm hover:border-accent/40 transition-colors">
          <div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0 text-lg">
            ✈
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-accent mb-1">
              {t("shippingTitle")}
            </h4>
            <p className="text-xs text-muted leading-relaxed font-normal">{t("shipping")}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 p-5 rounded-lg border border-border/60 bg-background/60 backdrop-blur-sm shadow-sm hover:border-accent/40 transition-colors">
          <div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0 text-lg">
            💳
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-accent mb-1">
              {t("installmentsTitle")}
            </h4>
            <p className="text-xs text-muted leading-relaxed font-normal">{t("installments")}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 p-5 rounded-lg border border-border/60 bg-background/60 backdrop-blur-sm shadow-sm hover:border-accent/40 transition-colors">
          <div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0 text-lg">
            🌐
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-accent mb-1">
              {t("supportTitle")}
            </h4>
            <p className="text-xs text-muted leading-relaxed font-normal">{t("support")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
