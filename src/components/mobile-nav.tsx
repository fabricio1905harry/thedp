"use client";

import { useState } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import type { SiteMode } from "@/lib/site-mode";

import type { CurrentCustomer } from "@/lib/auth";
import { logoutAction } from "@/app/[locale]/login/actions";

interface Labels {
  novidades: string;
  destaques: string;
  colecoes: string;
  atacado: string;
  sobre: string;
  login: string;
  cadastro: string;
  sair: string;
  statusApproved: string;
  statusPending: string;
  statusRejected: string;
}

export function MobileNav({
  labels,
  categories,
  siteMode,
  customer,
}: {
  labels: Labels;
  categories: string[];
  siteMode: SiteMode;
  customer?: CurrentCustomer | null;
}) {
  const [open, setOpen] = useState(false);
  const isNacional = siteMode === "nacional";

  return (
    <div className="md:hidden">
      <button
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="w-9 h-9 flex items-center justify-center border border-border"
      >
        ☰
      </button>

      {open && (
        <div className="fixed inset-0 bg-background z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <Image
              src="/brand/logo-horizontal.png"
              alt="The Dressing Project"
              width={1190}
              height={117}
              className="h-6 w-auto"
            />
            <button
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="w-9 h-9 flex items-center justify-center border border-border"
            >
              ✕
            </button>
          </div>

          <nav className="flex flex-col divide-y divide-border overflow-y-auto flex-1">
            {customer && (
              <div className="p-4 bg-surface flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold truncate max-w-[200px]">{customer.email}</p>
                  <span
                    className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      customer.status === "approved"
                        ? "bg-foreground text-background border-foreground"
                        : customer.status === "pending"
                        ? "bg-surface text-muted border-border"
                        : "bg-background text-foreground border-foreground border-2"
                    }`}
                  >
                    {customer.status === "approved"
                      ? labels.statusApproved
                      : customer.status === "pending"
                      ? labels.statusPending
                      : labels.statusRejected}
                  </span>
                </div>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    onClick={() => setOpen(false)}
                    className="text-xs border border-border px-3 py-1.5 font-medium hover:text-accent"
                  >
                    {labels.sair}
                  </button>
                </form>
              </div>
            )}

            <MobileLink href="/" onClick={() => setOpen(false)}>
              {labels.novidades}
            </MobileLink>
            <MobileLink href="/" onClick={() => setOpen(false)}>
              {labels.destaques}
            </MobileLink>
            {categories.map((category) => (
              <MobileLink
                key={category}
                href={`/categorias/${encodeURIComponent(category.toLowerCase())}`}
                onClick={() => setOpen(false)}
              >
                {category}
              </MobileLink>
            ))}
            {!isNacional && (
              <MobileLink href="/atacado" onClick={() => setOpen(false)}>
                {labels.atacado}
              </MobileLink>
            )}
            <MobileLink href="/sobre" onClick={() => setOpen(false)}>
              {labels.sobre}
            </MobileLink>
            {!isNacional && !customer && (
              <>
                <MobileLink href="/login" onClick={() => setOpen(false)}>
                  {labels.login}
                </MobileLink>
                <MobileLink href="/cadastro" onClick={() => setOpen(false)}>
                  {labels.cadastro}
                </MobileLink>
              </>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}

function MobileLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="px-4 py-4 text-sm font-medium uppercase tracking-wide hover:text-accent"
    >
      {children}
    </Link>
  );
}
