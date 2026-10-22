"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminLogout } from "@/app/admin/auth-actions";

type IconProps = { className?: string };

function OverviewIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function ProductsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="7" width="18" height="13" rx="1" />
      <path d="M3 7l2-4h14l2 4" />
    </svg>
  );
}

function OrdersIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

function PackagingIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3l8 4v10l-8 4-8-4V7l8-4z" />
      <path d="M4 7l8 4 8-4" />
      <path d="M12 11v10" />
    </svg>
  );
}

function ExchangeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7 7h11l-3-3" />
      <path d="M17 17H6l3 3" />
    </svg>
  );
}

function CustomersIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="8" r="3" />
      <path d="M5 20c0-4 3-6 7-6s7 2 7 6" />
    </svg>
  );
}

function AutomationIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}

interface NavItem {
  href: string;
  label: string;
  icon: (props: IconProps) => ReactElement;
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/admin", label: "Dashboard", icon: OverviewIcon },
      { href: "/admin/acoes", label: "Action Center", icon: AutomationIcon },
    ],
  },
  {
    label: "Site",
    items: [
      { href: "/admin/conteudo", label: "Conteúdo do site", icon: OverviewIcon },
      { href: "/admin/textos", label: "Textos da interface", icon: OverviewIcon },
      { href: "/admin/contatos", label: "Contatos recebidos", icon: CustomersIcon },
    ],
  },
  {
    label: "Catálogo & Vendas",
    items: [
      { href: "/admin/precificacao", label: "Precificação", icon: OverviewIcon },
      { href: "/admin/produtos", label: "Produtos", icon: ProductsIcon },
      { href: "/admin/imagens", label: "Imagens p/ revisar", icon: ProductsIcon },
      { href: "/admin/pedidos", label: "Pedidos", icon: OrdersIcon },
      { href: "/admin/vendas-perdidas", label: "Vendas perdidas", icon: OrdersIcon },
      { href: "/admin/embalagens", label: "Embalagens DHL", icon: PackagingIcon },
    ],
  },
  {
    label: "Curadoria & Dados",
    items: [
      { href: "/admin/marcas", label: "Marcas", icon: ProductsIcon },
      { href: "/admin/colecoes", label: "Coleções", icon: ProductsIcon },
      { href: "/admin/lookbooks", label: "Lookbooks", icon: ProductsIcon },
      { href: "/admin/edits", label: "TDP Edits", icon: ProductsIcon },
      { href: "/admin/placements", label: "Placements pagos", icon: OverviewIcon },
      { href: "/admin/avise-me", label: "Avise-me (reposição)", icon: AutomationIcon },
      { href: "/admin/cores", label: "Cores", icon: OverviewIcon },
      { href: "/admin/tamanhos", label: "Tamanhos", icon: OverviewIcon },
      { href: "/admin/ncm", label: "NCM / HS", icon: OverviewIcon },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { href: "/admin/pagamentos", label: "Pagamentos", icon: ExchangeIcon },
      { href: "/admin/cambio", label: "Câmbio", icon: ExchangeIcon },
    ],
  },
  {
    label: "Clientes & Sistema",
    items: [
      { href: "/admin/clientes", label: "Contas atacado", icon: CustomersIcon },
      { href: "/admin/whatsapp", label: "WhatsApp", icon: CustomersIcon },
      { href: "/admin/automacao", label: "Automação", icon: AutomationIcon },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`group relative flex items-center gap-2 text-sm py-2 px-2 transition-all duration-200 ${
        active ? "bg-surface font-medium" : "hover:bg-surface hover:translate-x-0.5"
      }`}
    >
      <span
        aria-hidden
        className={`absolute left-0 top-1 bottom-1 w-0.5 bg-foreground origin-center transition-transform duration-300 ${
          active ? "scale-y-100" : "scale-y-0 group-hover:scale-y-50"
        }`}
      />
      <Icon className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
      {item.label}
    </Link>
  );
}

function NavGroups({ pathname, onLinkClick }: { pathname: string; onLinkClick?: () => void }) {
  return (
    <>
      {NAV_GROUPS.map((group, i) => (
        <div key={group.label ?? `group-${i}`} className={i > 0 ? "mt-4" : undefined}>
          {group.label && (
            <p className="text-[10px] text-muted uppercase tracking-wider mb-1 px-2">{group.label}</p>
          )}
          <div className="space-y-1">
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} onClick={onLinkClick} />
            ))}
          </div>
        </div>
      ))}
      <form action={adminLogout} className="mt-6 px-2">
        <button type="submit" className="text-xs text-muted hover:text-accent underline">
          Sair
        </button>
      </form>
    </>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <Image
          src="/brand/logo-horizontal.png"
          alt="The Dressing Project"
          width={1190}
          height={117}
          className="h-5 w-auto"
        />
        <button
          aria-label="Abrir menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="w-9 h-9 flex items-center justify-center border border-border"
        >
          ☰
        </button>
      </div>

      <aside className="hidden md:block w-56 border-r border-border p-4 space-y-1 shrink-0">
        <Image
          src="/brand/logo-horizontal.png"
          alt="The Dressing Project"
          width={1190}
          height={117}
          className="h-5 w-auto mb-4"
        />
        <p className="text-xs text-muted mb-4 -mt-3">admin</p>
        <NavGroups pathname={pathname} />
      </aside>

      {open && (
        <div className="fixed inset-0 bg-background z-50 flex flex-col md:hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <Image
              src="/brand/logo-horizontal.png"
              alt="The Dressing Project"
              width={1190}
              height={117}
              className="h-6 w-auto"
            />
            <button
              aria-label="Fechar menu"
              onClick={() => setOpen(false)}
              className="w-9 h-9 flex items-center justify-center border border-border"
            >
              ✕
            </button>
          </div>
          <nav className="p-4 overflow-y-auto flex-1">
            <NavGroups pathname={pathname} onLinkClick={() => setOpen(false)} />
          </nav>
        </div>
      )}
    </>
  );
}
