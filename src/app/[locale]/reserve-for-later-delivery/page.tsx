import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function ReserveForLaterDeliveryPage() {
  const t = await getTranslations("reserve");
  const steps = [1, 2, 3, 4, 5, 6] as const;

  return (
    <div className="max-w-3xl mx-auto px-4 py-14 sm:py-20">
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">{t("eyebrow")}</p>
      <h1 className="font-serif text-4xl sm:text-5xl mt-3">{t("title")}</h1>
      <p className="mt-5 text-base text-muted leading-relaxed">{t("intro")}</p>

      <div className="mt-8 border border-foreground p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em]">{t("depositNoticeTitle")}</p>
        <p className="mt-2 text-sm leading-relaxed">{t("depositNoticeText")}</p>
      </div>

      <ol className="mt-12 space-y-8">
        {steps.map((n) => (
          <li key={n} className="grid grid-cols-[3rem_1fr] gap-4">
            <span className="font-serif text-4xl text-border leading-none">{String(n).padStart(2, "0")}</span>
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em]">{t(`step${n}Title`)}</h2>
              <p className="mt-2 text-sm text-muted leading-relaxed">{t(`step${n}Text`)}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="mt-14 border border-border p-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em]">{t("changesTitle")}</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted leading-relaxed list-disc pl-5">
          <li>{t("changesBefore")}</li>
          <li>{t("changesAfter")}</li>
        </ul>
        <p className="mt-4 text-xs text-muted">
          {t("termsPrefix")}{" "}
          <Link href="/politicas/termos" className="underline text-foreground">
            {t("termsLink")}
          </Link>
          .
        </p>
      </section>

      <div className="mt-10">
        <Link href="/contato" className="inline-block bg-foreground text-background px-8 py-3.5 text-[11px] uppercase tracking-[0.2em] font-semibold hover:bg-accent-hover transition-colors">
          {t("cta")}
        </Link>
      </div>
    </div>
  );
}
