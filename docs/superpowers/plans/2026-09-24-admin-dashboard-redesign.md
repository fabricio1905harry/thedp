# Admin Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the admin panel's sidebar (grouped, active-state, icons, mobile drawer) and overview page (revenue, status breakdown, 30-day trend chart, quick-action shortcuts), per `docs/superpowers/specs/2026-09-24-admin-dashboard-redesign-design.md`.

**Architecture:** Two independent, sequential changes in the existing Next.js App Router admin area (`src/app/admin/`): (1) extract the sidebar into a new Client Component with grouped/active nav and a mobile drawer reusing the storefront's existing drawer pattern, (2) rewrite the overview page's data-fetching and layout to add revenue-by-currency, a 30-day order trend, a status breakdown, and two shortcut lists. Both are Server Components except the new sidebar (needs `usePathname` + open/close state).

**Tech Stack:** Next.js 16 App Router, React 19, Supabase JS client (`@/lib/supabase/server`), Tailwind CSS v4. No new dependencies.

## Global Constraints

- No new npm dependency — icons are hand-written inline SVG, the trend chart is hand-written inline SVG. (spec: Non-goals)
- No new database tables/migrations — all data comes from existing `customers` and `orders` columns. (spec: Non-goals)
- No currency conversion — BRL and USD totals are always shown separately, never summed together. (spec: Non-goals)
- No changes to any other admin screen beyond linking into them from the new shortcuts. (spec: Non-goals)
- All UI copy is Portuguese (pt-BR), matching every existing admin string.
- Follow existing visual conventions: `border border-border`, `rounded-sm` cards, `text-xs text-muted uppercase` section labels, `bg-surface` hover/active states — these are used throughout `src/app/admin/page.tsx` and `src/app/admin/layout.tsx` today.
- This repo has no test runner configured (no jest/vitest/playwright in `package.json`). Verification is `npx tsc --noEmit`, `npm run lint`, and manual checks via the dev server — not unit tests.

---

### Task 1: Sidebar redesign — grouped nav, active state, mobile drawer

**Files:**
- Create: `src/components/admin-sidebar.tsx`
- Modify: `src/app/admin/layout.tsx` (full replacement, shown below)

**Interfaces:**
- Produces: `AdminSidebar` — a zero-prop React Client Component exported from `src/components/admin-sidebar.tsx`, rendering the mobile top bar, desktop `<aside>`, and mobile drawer. Consumed by `src/app/admin/layout.tsx`.

- [ ] **Step 1: Create `src/components/admin-sidebar.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
  { label: null, items: [{ href: "/admin", label: "Visão geral", icon: OverviewIcon }] },
  {
    label: "Catálogo & Vendas",
    items: [
      { href: "/admin/produtos", label: "Produtos", icon: ProductsIcon },
      { href: "/admin/pedidos", label: "Pedidos", icon: OrdersIcon },
      { href: "/admin/embalagens", label: "Embalagens DHL", icon: PackagingIcon },
      { href: "/admin/cambio", label: "Câmbio", icon: ExchangeIcon },
    ],
  },
  {
    label: "Clientes & Sistema",
    items: [
      { href: "/admin/clientes", label: "Cadastros pendentes", icon: CustomersIcon },
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
      className={`flex items-center gap-2 text-sm py-2 px-2 rounded-none ${
        active ? "bg-surface font-medium" : "hover:bg-surface"
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
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
```

- [ ] **Step 2: Replace `src/app/admin/layout.tsx`**

```tsx
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { getCurrentStaff } from "@/lib/admin-auth";
import { AdminSidebar } from "@/components/admin-sidebar";
import "../globals.css";

const body = Inter({ variable: "--font-body", subsets: ["latin"] });

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const staff = await getCurrentStaff();

  return (
    <html lang="pt" className={`${body.variable} h-full`}>
      <body className="min-h-full flex flex-col md:flex-row font-sans antialiased bg-background text-foreground">
        {!staff ? (
          <div className="w-full flex items-center justify-center min-h-screen px-4">
            <div className="max-w-sm text-center">
              <h1 className="font-medium text-lg mb-2">Acesso restrito</h1>
              <p className="text-sm text-muted">
                {process.env.NEXT_PUBLIC_SUPABASE_URL
                  ? "Entre com uma conta de operador ou admin para acessar o painel."
                  : "Painel indisponível: banco de dados do projeto ainda em provisionamento (task #2)."}
              </p>
            </div>
          </div>
        ) : (
          <>
            <AdminSidebar />
            <main className="flex-1 p-4 md:p-8">{children}</main>
          </>
        )}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `admin-sidebar.tsx` or `admin/layout.tsx`.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors/warnings on the two changed/new files.

- [ ] **Step 5: Manual verification via dev server**

Run: `npm run dev`, then open `/admin` as a signed-in staff/admin account (or, if Supabase isn't configured locally, confirm the "Acesso restrito" fallback still renders).

Check:
- Desktop width (≥768px): sidebar shows the "Visão geral" link ungrouped, then "Catálogo & Vendas" and "Clientes & Sistema" group labels each with their links; the link matching the current route has a `bg-surface` highlight.
- Navigate to `/admin/produtos` and to a nested route like `/admin/produtos/<any-existing-id>`: "Produtos" stays highlighted in both cases.
- Narrow the viewport below 768px: the desktop `<aside>` disappears, a top bar with logo + hamburger button appears. Click the hamburger: a full-screen drawer opens with the same grouped links. Click a link: drawer closes and navigates. Click the ✕: drawer closes without navigating.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin-sidebar.tsx src/app/admin/layout.tsx
git commit -m "Redesign admin sidebar: grouped nav, active state, mobile drawer"
```

---

### Task 2: Overview page — revenue, trend chart, status breakdown, shortcuts

**Files:**
- Modify: `src/app/admin/page.tsx` (full replacement, shown below)

**Interfaces:**
- Consumes: `ORDER_STATUS_LABELS` from `@/lib/order-status` (existing, keys: `created`, `paid`, `processing`, `shipped`, `delivered`, `canceled`); `createClient` from `@/lib/supabase/server` (existing).
- Produces: nothing consumed by other tasks — this is the last task.

- [ ] **Step 1: Replace `src/app/admin/page.tsx`**

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";

interface OrderRow {
  id: string;
  status: string;
  currency: string;
  total: number;
  created_at: string;
}

interface PendingCustomerRow {
  id: string;
  email: string;
  created_at: string;
}

interface OverviewData {
  pendingCustomers: number;
  approvedCustomers: number;
  draftProducts: number;
  publishedProducts: number;
  orders: number;
  revenueByCurrency: Record<string, number>;
  dailyCounts: { date: string; count: number }[];
  statusCounts: Record<string, number>;
  recentOrders: OrderRow[];
  pendingCustomersList: PendingCustomerRow[];
}

async function getOverviewData(): Promise<OverviewData | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const supabase = await createClient();
    const now = new Date();
    const since = new Date(now);
    since.setDate(since.getDate() - 29);
    const sinceIso = since.toISOString();

    const [
      pendingCustomersRes,
      approvedCustomersRes,
      draftProductsRes,
      publishedProductsRes,
      ordersRes,
      recentOrdersRes,
      last30dOrdersRes,
      pendingCustomersListRes,
    ] = await Promise.all([
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("status", "approved"),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "draft"),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "published"),
      supabase.from("orders").select("id", { count: "exact", head: true }),
      supabase
        .from("orders")
        .select("id, status, currency, total, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("orders")
        .select("id, status, currency, total, created_at")
        .gte("created_at", sinceIso),
      supabase
        .from("customers")
        .select("id, email, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(5),
    ]);

    const last30d = (last30dOrdersRes.data ?? []) as OrderRow[];

    const revenueByCurrency: Record<string, number> = { BRL: 0, USD: 0 };
    for (const o of last30d) {
      revenueByCurrency[o.currency] = (revenueByCurrency[o.currency] ?? 0) + Number(o.total);
    }

    const dailyCounts: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dailyCounts.push({ date: d.toISOString().slice(0, 10), count: 0 });
    }
    const dailyIndex = new Map(dailyCounts.map((d, idx) => [d.date, idx]));
    for (const o of last30d) {
      const day = o.created_at.slice(0, 10);
      const idx = dailyIndex.get(day);
      if (idx !== undefined) dailyCounts[idx].count += 1;
    }

    const statusCounts: Record<string, number> = {};
    for (const status of Object.keys(ORDER_STATUS_LABELS)) {
      statusCounts[status] = 0;
    }
    for (const o of last30d) {
      if (o.status in statusCounts) statusCounts[o.status] += 1;
    }

    return {
      pendingCustomers: pendingCustomersRes.count ?? 0,
      approvedCustomers: approvedCustomersRes.count ?? 0,
      draftProducts: draftProductsRes.count ?? 0,
      publishedProducts: publishedProductsRes.count ?? 0,
      orders: ordersRes.count ?? 0,
      revenueByCurrency,
      dailyCounts,
      statusCounts,
      recentOrders: (recentOrdersRes.data ?? []) as OrderRow[],
      pendingCustomersList: (pendingCustomersListRes.data ?? []) as PendingCustomerRow[],
    };
  } catch {
    return null;
  }
}

export default async function AdminOverviewPage() {
  const data = await getOverviewData();

  return (
    <div>
      <h1 className="font-serif text-2xl mb-6">Visão geral</h1>
      {!data ? (
        <p className="text-sm text-muted">
          Sem conexão com o banco ainda — os números aparecem assim que o
          Supabase estiver provisionado (task #2) e a migração aplicada
          (task #3).
        </p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Stat label="Cadastros pendentes" value={data.pendingCustomers} />
            <Stat label="Clientes aprovados" value={data.approvedCustomers} />
            <Stat label="Produtos rascunho" value={data.draftProducts} />
            <Stat label="Produtos publicados" value={data.publishedProducts} />
            <Stat label="Pedidos" value={data.orders} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CurrencyCard currency="BRL" amount={data.revenueByCurrency.BRL ?? 0} />
            <CurrencyCard currency="USD" amount={data.revenueByCurrency.USD ?? 0} />
          </div>

          <TrendChart data={data.dailyCounts} />

          <StatusBreakdown counts={data.statusCounts} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PendingCustomersCard customers={data.pendingCustomersList} />
            <RecentOrdersCard orders={data.recentOrders} />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border rounded-sm p-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted mt-1">{label}</p>
    </div>
  );
}

function CurrencyCard({ currency, amount }: { currency: string; amount: number }) {
  const symbol = currency === "BRL" ? "R$" : currency === "USD" ? "US$" : currency;
  return (
    <div className="border border-border rounded-sm p-4">
      <p className="text-2xl font-semibold">
        {symbol} {amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
      <p className="text-xs text-muted mt-1">Faturamento (30 dias) — {currency}</p>
    </div>
  );
}

function TrendChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const width = 600;
  const height = 120;
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const pointY = (count: number) => height - (count / max) * (height - 16) - 8;
  const points = data.map((d, i) => `${i * stepX},${pointY(d.count)}`);
  const firstLabel = data[0]?.date.slice(5).replace("-", "/");
  const lastLabel = data[data.length - 1]?.date.slice(5).replace("-", "/");

  return (
    <div className="border border-border rounded-sm p-4">
      <p className="text-xs text-muted uppercase mb-3">Pedidos por dia — últimos 30 dias</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-28" preserveAspectRatio="none">
        <polyline points={points.join(" ")} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
        {data.map((d, i) => (
          <circle key={d.date} cx={i * stepX} cy={pointY(d.count)} r={d.count > 0 ? 2 : 0} fill="var(--accent)" />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-muted mt-1">
        <span>{firstLabel}</span>
        <span>máx: {max}</span>
        <span>{lastLabel}</span>
      </div>
    </div>
  );
}

function StatusBreakdown({ counts }: { counts: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(counts));
  return (
    <div className="border border-border rounded-sm p-4">
      <p className="text-xs text-muted uppercase mb-3">Pedidos por status (30 dias)</p>
      <div className="space-y-2">
        {Object.entries(ORDER_STATUS_LABELS).map(([status, label]) => {
          const count = counts[status] ?? 0;
          return (
            <div key={status} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 text-muted">{label}</span>
              <div className="flex-1 bg-surface h-2 rounded-full overflow-hidden">
                <div className="bg-accent h-full" style={{ width: `${(count / max) * 100}%` }} />
              </div>
              <span className="w-6 text-right shrink-0">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PendingCustomersCard({ customers }: { customers: PendingCustomerRow[] }) {
  return (
    <div className="border border-border rounded-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted uppercase">Cadastros pendentes</p>
        <Link href="/admin/clientes" className="text-xs text-accent underline">
          Ver todos →
        </Link>
      </div>
      {customers.length === 0 ? (
        <p className="text-xs text-muted">Nenhum cadastro pendente.</p>
      ) : (
        <ul className="space-y-2">
          {customers.map((c) => (
            <li key={c.id} className="flex items-center justify-between text-xs">
              <span className="truncate max-w-[65%]">{c.email}</span>
              <span className="text-muted">{formatShortDate(c.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecentOrdersCard({ orders }: { orders: OrderRow[] }) {
  return (
    <div className="border border-border rounded-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted uppercase">Pedidos recentes</p>
        <Link href="/admin/pedidos" className="text-xs text-accent underline">
          Ver todos →
        </Link>
      </div>
      {orders.length === 0 ? (
        <p className="text-xs text-muted">Nenhum pedido ainda.</p>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/admin/pedidos/${o.id}`}
                className="flex items-center justify-between text-xs hover:text-accent"
              >
                <span>{ORDER_STATUS_LABELS[o.status] ?? o.status}</span>
                <span>
                  {o.total} {o.currency}
                </span>
                <span className="text-muted">{formatShortDate(o.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `admin/page.tsx`.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors/warnings on the changed file.

- [ ] **Step 4: Manual verification via dev server**

Run: `npm run dev`, open `/admin`.

Check:
- If Supabase isn't configured (`NEXT_PUBLIC_SUPABASE_URL` unset), the "Sem conexão com o banco" message still renders exactly as before.
- With Supabase configured and some seed data: 5 stat cards render across the top; two revenue cards show "R$ 0,00" / "US$ 0,00" (or real sums) without crashing when there are zero orders in the window; the trend chart renders a flat/empty line without division-by-zero errors when `dailyCounts` is all zeros; the status breakdown lists all six statuses even when some have 0; "Cadastros pendentes" and "Pedidos recentes" show their empty-state text when there's no data, and populated rows link correctly to `/admin/clientes` and `/admin/pedidos/<id>` respectively when data exists.
- Resize to mobile width: the two-column grids (revenue cards, shortcuts) stack to one column; no horizontal overflow.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "Add revenue, trend chart, status breakdown and shortcuts to admin overview"
```
