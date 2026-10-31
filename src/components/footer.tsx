import { BrandLogo } from "@/components/brand-logo";
import { Link } from "@/i18n/navigation";
import { NewsletterForm } from "@/components/newsletter-form";
import type { SiteMode } from "@/lib/site-mode";

export interface FooterContent {
  tagline: string;
  links: { group: string; label: string; href: string }[];
  social: { whatsapp: string; email: string; instagram: string; linkedin: string } | null;
  newsletter: { title: string; text: string; placeholder: string; button: string; success: string } | null;
  nationalNotice: string;
}

/** Links that only make sense on the international (wholesale) site. */
const INTERNATIONAL_ONLY = [
  "/cadastro",
  "/login",
  "/minha-conta",
  "/reserve-for-later-delivery",
  "/politicas/frete-e-impostos",
  "/politicas/incoterms",
  "/politicas/termos-de-atacado",
  "/politicas/termos-de-reserva",
];

export function footerLinks(links: FooterContent["links"], siteMode: SiteMode, signedIn: boolean) {
  return links.filter((l) => {
    if (!l.label || !l.href) return false;
    if (siteMode === "nacional" && INTERNATIONAL_ONLY.includes(l.href)) return false;
    // already signed in: "create account" / "sign in" make no sense
    if (signedIn && (l.href === "/cadastro" || l.href === "/login")) return false;
    return true;
  });
}

function externalHref(value: string, kind: "wa" | "mail") {
  const v = value.trim();
  if (/^https?:|^mailto:/i.test(v)) return v;
  return kind === "wa" ? `https://wa.me/${v.replace(/\D/g, "")}` : `mailto:${v}`;
}

export function Footer({
  siteMode,
  signedIn = false,
  content,
}: {
  siteMode: SiteMode;
  signedIn?: boolean;
  content: FooterContent;
}) {
  const isNacional = siteMode === "nacional";
  const groups = new Map<string, FooterContent["links"]>();
  for (const link of footerLinks(content.links, siteMode, signedIn)) {
    const g = link.group || "";
    groups.set(g, [...(groups.get(g) ?? []), link]);
  }
  const social = content.social;
  const whatsapp = social?.whatsapp?.trim();
  const email = social?.email?.trim();

  return (
    <footer className="border-t border-border mt-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-10 text-sm">
        <div className="col-span-2">
          <BrandLogo className="h-6 w-auto" />
          {content.tagline && <p className="mt-4 text-xs text-muted leading-relaxed max-w-[16rem]">{content.tagline}</p>}
          {(whatsapp || email || social?.instagram || social?.linkedin) && (
            <ul className="mt-4 space-y-1.5 text-xs text-muted">
              {whatsapp && (
                <li>
                  <a href={externalHref(whatsapp, "wa")} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                    WhatsApp
                  </a>
                </li>
              )}
              {email && (
                <li>
                  <a href={externalHref(email, "mail")} className="hover:text-foreground">
                    {email}
                  </a>
                </li>
              )}
              {social?.instagram && (
                <li>
                  <a href={social.instagram} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                    Instagram
                  </a>
                </li>
              )}
              {social?.linkedin && (
                <li>
                  <a href={social.linkedin} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                    LinkedIn
                  </a>
                </li>
              )}
            </ul>
          )}
        </div>
        {[...groups.entries()].map(([heading, links]) => (
          <div key={heading}>
            {heading && <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] mb-4">{heading}</h3>}
            <ul className="space-y-2.5 text-muted">
              {links.map((l, i) => (
                <li key={`${l.href}-${i}`}>
                  <Link href={l.href} className="hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {content.newsletter && !isNacional && (
        <div className="border-t border-border">
          <div className="max-w-7xl mx-auto px-4 py-8">
            <NewsletterForm {...content.newsletter} />
          </div>
        </div>
      )}
      {isNacional && content.nationalNotice && (
        <div className="bg-surface text-center text-xs py-3 px-4 border-t border-border">{content.nationalNotice}</div>
      )}
      <div className="text-center text-[11px] uppercase tracking-[0.2em] text-muted py-5 border-t border-border">
        © The Dressing Project {new Date().getFullYear()}
      </div>
    </footer>
  );
}
