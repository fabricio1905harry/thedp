import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { getPublicBlocks } from "@/lib/cms";
import { operationForSiteMode } from "@/lib/cms-types";
import { driveFileId, normalizeImageUrl } from "@/lib/image-url";
import { SITE_MODE_HEADER, type SiteMode } from "@/lib/site-mode";
import { VideoPlayer } from "@/components/video-player";
import { RemoteImage } from "@/components/remote-image";
import { ABOUT_PHOTO_DRIVE_URL } from "@/lib/cms-blocks";

type C = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown) => (Array.isArray(v) ? (v as C[]) : []);

/**
 * About — every section comes from the CMS (Admin → Conteúdo do site → About):
 * ON/OFF, order and text in EN/ES/PT. The photo is loaded from the Drive link.
 */
export default async function SobrePage() {
  const locale = await getLocale();
  const headerList = await headers();
  const siteMode = (headerList.get(SITE_MODE_HEADER) as SiteMode) ?? "internacional";
  const blocks = await getPublicBlocks("about", operationForSiteMode(siteMode), locale);

  return (
    <div>
      {blocks.map(({ key, content: c }) => {
        switch (key) {
          case "hero": {
            const image = normalizeImageUrl(s(c.image));
            return (
              <section key={key}>
                {image && (
                  <div className="w-full bg-surface overflow-hidden">
                    <RemoteImage
                      src={image}
                      fallbackSrc={driveFileId(s(c.image)) === driveFileId(ABOUT_PHOTO_DRIVE_URL) ? "/brand/about-photo.jpg" : undefined}
                      alt={s(c.title)}
                      priority
                      className="w-full h-[60vw] max-h-[680px] min-h-[260px] object-cover object-[center_30%]"
                    />
                  </div>
                )}
                <div className="max-w-3xl mx-auto px-4 py-14 sm:py-20 text-center">
                  <h1 className="font-serif text-4xl sm:text-6xl tracking-wide">{s(c.title)}</h1>
                  {s(c.intro) && <p className="mt-6 text-base sm:text-lg text-muted leading-relaxed">{s(c.intro)}</p>}
                </div>
              </section>
            );
          }
          case "history":
          case "vision":
            return (
              <section key={key} className={key === "vision" ? "bg-foreground text-background" : "border-t border-border"}>
                <div className="max-w-3xl mx-auto px-4 py-14 sm:py-20 text-center">
                  <p className={`text-[11px] font-semibold uppercase tracking-[0.3em] ${key === "vision" ? "text-background/60" : "text-muted"}`}>{s(c.title)}</p>
                  <p className="mt-6 font-serif text-2xl sm:text-3xl leading-snug">{s(c.text)}</p>
                </div>
              </section>
            );
          case "journey": {
            const items = list(c.items);
            return (
              <section key={key} className="max-w-4xl mx-auto px-4 py-14 sm:py-20">
                <h2 className="text-center text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">{s(c.title)}</h2>
                <ol className="mt-12 relative border-l border-border ml-3 sm:ml-0 sm:border-l-0 sm:space-y-0">
                  {items.map((item, i) => {
                    const image = normalizeImageUrl(s(item.image), 1200);
                    return (
                      <li key={i} className="relative pl-8 pb-12 last:pb-0 sm:pl-0 sm:grid sm:grid-cols-[8rem_1px_1fr] sm:gap-8">
                        <span className="absolute left-[-5px] top-1.5 w-2.5 h-2.5 rounded-full bg-foreground sm:hidden" />
                        <p className="hidden sm:block text-right font-serif text-2xl text-muted pt-0.5">{s(item.year)}</p>
                        <span className="hidden sm:block bg-border relative">
                          <span className="absolute -left-[4px] top-2 w-[9px] h-[9px] rounded-full bg-foreground" />
                        </span>
                        <div>
                          {s(item.year) && <p className="sm:hidden font-serif text-lg text-muted">{s(item.year)}</p>}
                          <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em]">{s(item.title)}</h3>
                          <p className="mt-2 text-sm text-muted leading-relaxed">{s(item.text)}</p>
                          {image && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={image} alt="" referrerPolicy="no-referrer" className="mt-4 w-full max-w-md object-cover" />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          }
          case "founders": {
            const people = list(c.people);
            return (
              <section key={key} className="border-t border-border">
                <div className="max-w-5xl mx-auto px-4 py-14 sm:py-20">
                  <h2 className="text-center text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">{s(c.title)}</h2>
                  <div className="mt-12 grid sm:grid-cols-2 gap-12">
                    {people.map((p, i) => {
                      const photo = normalizeImageUrl(s(p.photo), 1000);
                      return (
                        <article key={i} className="text-center sm:text-left">
                          {photo && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={photo} alt={s(p.name)} referrerPolicy="no-referrer" className="w-full aspect-[4/5] object-cover mb-6 bg-surface" />
                          )}
                          <h3 className="font-serif text-2xl">{s(p.name)}</h3>
                          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">{s(p.role)}</p>
                          <p className="mt-4 text-sm text-muted leading-relaxed">{s(p.bio)}</p>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </section>
            );
          }
          case "film":
            if (!s(c.video_url)) return null;
            return (
              <section key={key} className="max-w-5xl mx-auto px-4 pb-16 sm:pb-24">
                {s(c.title) && <h2 className="text-center text-[11px] font-semibold uppercase tracking-[0.3em] text-muted mb-8">{s(c.title)}</h2>}
                <VideoPlayer url={s(c.video_url)} posterDesktop={normalizeImageUrl(s(c.poster))} title={s(c.title)} />
              </section>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
