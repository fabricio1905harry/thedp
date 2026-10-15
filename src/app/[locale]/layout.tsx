import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { headers } from "next/headers";
import { SITE_MODE_HEADER, type SiteMode } from "@/lib/site-mode";
import { SiteChrome } from "@/components/site-chrome";
import { CurrencyProvider } from "@/components/currency-provider";
import { CartProvider } from "@/components/cart-provider";
import { WhatsAppFloatingButton, WhatsAppProvider } from "@/components/whatsapp-button";
import { getWhatsAppSettings } from "@/lib/settings";
import "../globals.css";

const display = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const body = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "The Dressing Project",
  description: "Vestidos com identidade, prontos para o mundo.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);

  const headerList = await headers();
  const siteMode = (headerList.get(SITE_MODE_HEADER) as SiteMode) ?? "internacional";
  const whatsapp = await getWhatsAppSettings();

  return (
    <html lang={locale} className={`${display.variable} ${body.variable} h-full`}>
      <body className="min-h-full flex flex-col font-sans antialiased bg-background text-foreground">
        <NextIntlClientProvider>
          <CurrencyProvider>
            <CartProvider>
              <WhatsAppProvider settings={whatsapp}>
                <SiteChrome siteMode={siteMode}>{children}</SiteChrome>
                <WhatsAppFloatingButton />
              </WhatsAppProvider>
            </CartProvider>
          </CurrencyProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
