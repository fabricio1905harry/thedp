"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import {
  buildWhatsAppMessage,
  whatsAppHref,
  type WhatsAppContext,
  type WhatsAppSettings,
} from "@/lib/whatsapp";

const GENERAL: WhatsAppContext = { kind: "general" };

const Ctx = createContext<{
  settings: WhatsAppSettings | null;
  context: WhatsAppContext;
  setContext: (c: WhatsAppContext) => void;
}>({ settings: null, context: GENERAL, setContext: () => {} });

export function WhatsAppProvider({ settings, children }: { settings: WhatsAppSettings | null; children: ReactNode }) {
  const [context, setContext] = useState<WhatsAppContext>(GENERAL);
  return <Ctx.Provider value={{ settings, context, setContext }}>{children}</Ctx.Provider>;
}

/** Rendered by product/order pages to give the button its context. */
export function WhatsAppContextSetter({ context }: { context: WhatsAppContext }) {
  const { setContext } = useContext(Ctx);
  const key = JSON.stringify(context);
  useEffect(() => {
    setContext(JSON.parse(key) as WhatsAppContext);
    return () => setContext(GENERAL);
  }, [key, setContext]);
  return null;
}

function trackClick(source: string, context: WhatsAppContext, locale: string) {
  const payload = {
    event: "whatsapp_click",
    path: window.location.pathname,
    source,
    locale,
    metadata: { context: context.kind },
  };
  const w = window as unknown as { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
  w.dataLayer?.push({ event: "whatsapp_click", whatsapp_source: source, whatsapp_context: context.kind, page_path: payload.path });
  w.gtag?.("event", "whatsapp_click", { whatsapp_source: source, whatsapp_context: context.kind, page_path: payload.path });
  try {
    navigator.sendBeacon?.("/api/events", new Blob([JSON.stringify(payload)], { type: "application/json" }));
  } catch {
    // analytics must never block the click
  }
}

function useWhatsAppLink(source: string) {
  const { settings, context } = useContext(Ctx);
  const locale = useLocale();
  if (!settings?.active || !settings.number) return null;
  const href = whatsAppHref(settings, buildWhatsAppMessage(settings, locale, context));
  return { href, onClick: () => trackClick(source, context, locale) };
}

/** Floating button, desktop + mobile. Hidden when inactive in the Admin. */
export function WhatsAppFloatingButton() {
  const t = useTranslations("whatsapp");
  const pathname = usePathname();
  const link = useWhatsAppLink(`floating:${pathname}`);
  if (!link) return null;
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={link.onClick}
      aria-label={t("label")}
      title={t("label")}
      className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-40 w-14 h-14 rounded-full bg-[#25D366] text-white shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
    >
      <svg viewBox="0 0 32 32" className="w-7 h-7" fill="currentColor" aria-hidden="true">
        <path d="M16.04 3C9.4 3 4 8.36 4 14.96c0 2.1.56 4.16 1.62 5.97L4 29l8.27-1.6a12.1 12.1 0 0 0 3.77.6C22.68 28 28 22.64 28 16.04 28 9.4 22.68 3 16.04 3Zm0 22.6c-1.2 0-2.38-.2-3.5-.6l-.5-.17-4.9.95.98-4.73-.2-.5a9.9 9.9 0 0 1-1.5-5.29c0-5.5 4.5-9.97 10.04-9.97 5.5 0 9.95 4.47 9.95 9.97 0 5.83-4.46 10.34-10.37 10.34Zm5.5-7.48c-.3-.15-1.78-.88-2.06-.98-.28-.1-.48-.15-.68.15-.2.3-.78.98-.96 1.18-.18.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.5-.9-.8-1.5-1.78-1.67-2.08-.18-.3-.02-.46.13-.6.13-.14.3-.35.45-.53.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.68-1.63-.93-2.24-.24-.58-.5-.5-.68-.5h-.58c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.48.71.31 1.27.5 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.78-.73 2.03-1.43.25-.7.25-1.3.18-1.43-.08-.13-.28-.2-.58-.35Z" />
      </svg>
    </a>
  );
}

/** Inline CTA (e.g. CONTACT US TO COMPLETE YOUR ORDER). */
export function WhatsAppInlineLink({ source, children, className }: { source: string; children: ReactNode; className?: string }) {
  const link = useWhatsAppLink(source);
  if (!link) return null;
  return (
    <a href={link.href} target="_blank" rel="noopener noreferrer" onClick={link.onClick} className={className}>
      {children}
    </a>
  );
}
