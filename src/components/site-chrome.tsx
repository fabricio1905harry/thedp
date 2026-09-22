import type { ReactNode } from "react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import type { SiteMode } from "@/lib/site-mode";

export function SiteChrome({
  siteMode,
  children,
}: {
  siteMode: SiteMode;
  children: ReactNode;
}) {
  return (
    <>
      <Header siteMode={siteMode} />
      <main className="flex-1">{children}</main>
      <Footer siteMode={siteMode} />
    </>
  );
}
