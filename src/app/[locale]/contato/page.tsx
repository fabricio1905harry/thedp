import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { getPublicBlocks } from "@/lib/cms";
import { operationForSiteMode } from "@/lib/cms-types";
import { getWhatsAppSettings } from "@/lib/settings";
import { getCurrentCustomer } from "@/lib/auth";
import { SITE_MODE_HEADER, type SiteMode } from "@/lib/site-mode";
import { CmsLink } from "@/components/cms-link";
import { ContactForm } from "@/components/contact-form";

type C = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");

export default async function ContatoPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const { subject } = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("contactPage");
  const headerList = await headers();
  const siteMode = (headerList.get(SITE_MODE_HEADER) as SiteMode) ?? "internacional";
  const blocks = await getPublicBlocks("contact", operationForSiteMode(siteMode), locale);
  const byKey = new Map<string, C>(blocks.map((b) => [b.key, b.content]));
  const wa = await getWhatsAppSettings();
  const customer = await getCurrentCustomer();

  const intro = byKey.get("intro");
  const form = byKey.get("form");
  const wholesale = byKey.get("wholesale_cta");
  const brand = byKey.get("brand_cta");

  const waRaw = s(intro?.whatsapp).trim() || (wa?.number ?? "");
  const waHref = waRaw ? (/^https?:/.test(waRaw) ? waRaw : `https://wa.me/${waRaw.replace(/\D/g, "")}`) : "";
  const email = s(intro?.email).trim();
  const subjects = ((form?.subjects as C[]) ?? []).map((x) => ({ value: s(x.value), label: s(x.label) }));

  return (
    <div className="max-w-5xl mx-auto px-4 py-14 sm:py-20">
      {intro && (
        <header className="max-w-2xl">
          <h1 className="font-serif text-4xl sm:text-5xl">{s(intro.title)}</h1>
          <p className="mt-5 text-base text-muted leading-relaxed">{s(intro.text)}</p>
        </header>
      )}

      <div className="mt-10 grid sm:grid-cols-2 gap-6 max-w-2xl">
        {waHref && (
          <a href={waHref} target="_blank" rel="noopener noreferrer" className="border border-border p-5 hover:border-foreground transition-colors">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">WhatsApp</p>
            <p className="mt-2 text-sm">{t("whatsappCta")}</p>
          </a>
        )}
        {email && (
          <a href={`mailto:${email}`} className="border border-border p-5 hover:border-foreground transition-colors">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">E-mail</p>
            <p className="mt-2 text-sm break-all">{email}</p>
          </a>
        )}
      </div>
      {s(intro?.extra) && <p className="mt-6 text-sm text-muted whitespace-pre-line max-w-2xl">{s(intro?.extra)}</p>}

      {form && subjects.length > 0 && (
        <section className="mt-14 max-w-3xl">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted mb-6">{s(form.title)}</h2>
          <ContactForm
            subjects={subjects}
            defaultSubject={subject ?? ""}
            defaults={{ email: customer?.email }}
          />
        </section>
      )}

      {(wholesale || brand) && (
        <div className="mt-16 grid md:grid-cols-2 gap-6">
          {[wholesale, brand].filter(Boolean).map((cta, i) => (
            <div key={i} className="border border-border p-8">
              <p className="text-sm text-muted leading-relaxed">{s(cta!.text)}</p>
              {s(cta!.cta_text) && s(cta!.cta_link) && (
                <CmsLink href={s(cta!.cta_link)} className="mt-6 inline-block bg-foreground text-background px-6 py-3 text-[11px] uppercase tracking-[0.2em] font-semibold hover:bg-accent-hover transition-colors">
                  {s(cta!.cta_text)}
                </CmsLink>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
