import { getLocale } from "next-intl/server";
import { InstitutionalPage } from "@/components/institutional-page";
import { getPublicBlock } from "@/lib/cms";
import { operationForSiteMode } from "@/lib/cms-types";
import { headers } from "next/headers";
import { SITE_MODE_HEADER, type SiteMode } from "@/lib/site-mode";

interface Section {
  heading: string;
  body: string;
}

/** Institutional page whose title, intro and sections are edited in Admin → Conteúdo → Pages. */
export async function CmsPage({ pageKey, fallbackTitle }: { pageKey: string; fallbackTitle: string }) {
  const locale = await getLocale();
  const mode = ((await headers()).get(SITE_MODE_HEADER) as SiteMode) ?? "internacional";
  const block = await getPublicBlock("pages", pageKey, operationForSiteMode(mode), locale).catch(() => null);
  const title = (block?.title as string) || fallbackTitle;
  const intro = (block?.intro as string) || "";
  const sections = ((block?.sections as Section[]) ?? []).filter((s) => s.heading || s.body);

  return (
    <InstitutionalPage title={title} pendingContent={!intro && sections.length === 0}>
      {intro && <p className="text-sm leading-relaxed whitespace-pre-line mb-8">{intro}</p>}
      <div className="space-y-8">
        {sections.map((s, i) => (
          <section key={i}>
            {s.heading && <h2 className="font-serif text-xl mb-2">{s.heading}</h2>}
            {s.body && <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/90">{s.body}</p>}
          </section>
        ))}
      </div>
    </InstitutionalPage>
  );
}
