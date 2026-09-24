# Admin dashboard redesign — sidebar + visão geral

Date: 2026-09-24

## Context

The admin panel (`src/app/admin/`) currently has a fixed, ungrouped sidebar
with no active-link state and no mobile handling (`w-56 shrink-0`, always
rendered). The overview page (`src/app/admin/page.tsx`) shows four raw
counts with no revenue, no status breakdown, no trend, and no shortcuts to
common tasks.

This redesign covers two areas only: the admin sidebar/navigation, and the
overview ("Visão geral") page. No other admin screens are in scope.

## Goals

- Sidebar: grouped navigation, active-link highlighting, small inline icons,
  and a mobile drawer consistent with the storefront's existing
  `mobile-nav.tsx` pattern.
- Visão geral: add revenue (split by currency), an order-status breakdown, a
  30-day daily order-count trend chart, and two quick-action lists (pending
  customers, recent orders) — without adding any new dependency.

## Non-goals

- No changes to any other admin screen (produtos, pedidos, clientes,
  embalagens, câmbio, automação) beyond linking into them from the new
  shortcuts.
- No currency conversion on the dashboard (BRL and USD totals are shown
  separately, never summed together).
- No new npm dependency (no icon library, no chart library) — icons are
  inline SVG, the chart is hand-rolled SVG.
- No new database tables or migrations; all data comes from existing
  `customers` and `orders` columns.

## Part A — Sidebar / navigation

### Data shape

`src/app/admin/layout.tsx` defines a grouped nav list:

```ts
const NAV_GROUPS: { label: string | null; items: { href: string; label: string }[] }[] = [
  { label: null, items: [{ href: "/admin", label: "Visão geral" }] },
  {
    label: "Catálogo & Vendas",
    items: [
      { href: "/admin/produtos", label: "Produtos" },
      { href: "/admin/pedidos", label: "Pedidos" },
      { href: "/admin/embalagens", label: "Embalagens DHL" },
      { href: "/admin/cambio", label: "Câmbio" },
    ],
  },
  {
    label: "Clientes & Sistema",
    items: [
      { href: "/admin/clientes", label: "Cadastros pendentes" },
      { href: "/admin/automacao", label: "Automação" },
    ],
  },
];
```

Each item also carries a small inline SVG icon (outline style, ~16px,
`stroke="currentColor"`), matching the minimalist look already used across
the site (no icon library).

### Component split

- `src/app/admin/layout.tsx` stays a Server Component; it no longer renders
  `<aside>` directly. It renders `<AdminSidebar staff={staff} />`, passing
  the nav config statically (defined in the same file or a small
  `admin-nav-config.ts` if it's reused).
- New Client Component `src/components/admin-sidebar.tsx`:
  - `"use client"`, uses `usePathname()` from `next/navigation` to compute
    the active item: exact match for `/admin`, prefix match (`pathname ===
    href || pathname.startsWith(href + "/")`) for every other item.
  - Renders the desktop sidebar (`hidden md:block`, `w-56 border-r
    border-border p-4`) with grouped links; active item gets
    `bg-surface font-medium`, others get the existing hover style.
  - Renders a mobile header bar (`md:hidden`) with the logo and a hamburger
    button (same `w-9 h-9 border border-border` button style as
    `mobile-nav.tsx`).
  - On hamburger click, opens a full-screen drawer (`fixed inset-0
    bg-background z-50`) reusing the same structure as
    `src/components/mobile-nav.tsx` (header row with logo + close button,
    scrollable nav list below, grouped the same way as desktop). Drawer
    closes on link click or close-button click.
- `src/app/admin/layout.tsx`'s `<main>` becomes `<main className="flex-1
  p-4 md:p-8">` (drawer/header takes the place of the old fixed `<aside>`
  on mobile; desktop layout is otherwise unchanged).

### Error handling

No new failure modes — `getCurrentStaff()` gating is unchanged; the sidebar
only renders once `staff` is present, exactly as today.

## Part B — Visão geral

### Data fetching

`src/app/admin/page.tsx` replaces `getCounts()` with `getOverviewData()`,
still guarded by `if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null`
and a try/catch returning `null` on any query failure (same pattern as
today — the page shows the existing "Sem conexão com o banco" message when
`null`).

Queries (all via the existing `createClient()` from `@/lib/supabase/server`):

1. Existing counts, plus one more:
   - `pendingCustomers`, `draftProducts`, `publishedProducts`, `orders`
     (unchanged, head-count queries)
   - `approvedCustomers`: count of `customers` where `status = 'approved'`
2. `recentOrdersRaw`: `orders` select `id, status, currency, total,
   created_at`, `order("created_at", { ascending: false })`, `limit(5)` —
   powers the "Pedidos recentes" shortcut.
3. `last30dOrders`: `orders` select `id, status, currency, total,
   created_at` where `created_at >= <today - 30 days ISO>`, no limit —
   powers revenue-by-currency, the daily trend chart, and the status
   breakdown. Aggregation happens in JS after fetching:
   - `revenueByCurrency`: reduce into `{ BRL: number, USD: number }`
     (default 0 for a currency with no orders in the window).
   - `dailyCounts`: array of 30 `{ date, count }` entries (oldest → newest),
     built by initializing a 30-slot map keyed by ISO date and incrementing
     per order's `created_at` date.
   - `statusCounts`: reduce into `Record<string, number>` keyed by the six
     known status values (0 for statuses with no orders).
4. `pendingCustomersRaw`: `customers` select `id, email, created_at` where
   `status = 'pending'`, `order("created_at", { ascending: true })`,
   `limit(5)` — powers the "Cadastros pendentes" shortcut.

All four queries run via `Promise.all`.

### Layout (top to bottom)

1. `<h1>` "Visão geral" (unchanged).
2. Stat grid, now 5 cards (`grid-cols-2 md:grid-cols-5`): Cadastros
   pendentes, Clientes aprovados, Produtos rascunho, Produtos publicados,
   Pedidos.
3. Revenue row: two cards side by side, "Faturamento (30 dias) — BRL" and
   "— USD", each showing the summed `total` for that currency (or "R$ 0" /
   "US$ 0" when empty, not hidden — keeps layout stable).
4. Trend chart card: "Pedidos por dia — últimos 30 dias", a static inline
   SVG polyline built server-side from `dailyCounts` (no client JS, no
   interactivity/tooltips — just axis min/max labels and the line+dots).
5. Status breakdown card: one row per status (label from
   `ORDER_STATUS_LABELS`), each a flex row with the label, the count, and a
   proportional `<div>` bar (`width: ${count/maxCount*100}%`) using
   `bg-surface`/`bg-accent`.
6. Shortcuts row: two cards side by side (`grid-cols-1 md:grid-cols-2`):
   - "Cadastros pendentes": lists up to 5 `pendingCustomersRaw` entries
     (email + relative/short date), "Ver todos →" link to `/admin/clientes`.
     Empty state: muted "Nenhum cadastro pendente." text, link still shown.
   - "Pedidos recentes": lists up to 5 `recentOrdersRaw` entries (status
     badge reusing `ORDER_STATUS_LABELS`, `total currency`, short date),
     each row links to `/admin/pedidos/[id]`; "Ver todos →" link to
     `/admin/pedidos`. Empty state: muted "Nenhum pedido ainda."

All new pieces are small presentational functions colocated in
`src/app/admin/page.tsx` (same pattern as the existing `Stat` helper) —
no new files needed for Part B.

### Error handling

Same as today: `getOverviewData()` returning `null` renders the existing
"Sem conexão com o banco ainda" message; no partial-failure states are
introduced (the four queries are independent reads with no side effects,
so a `Promise.all` rejection is caught by the same outer try/catch).

## Testing / verification

- `npx tsc --noEmit` must pass.
- Manual check via `run` skill / dev server: load `/admin` as a
  staff/admin account (or confirm the "Sem conexão" fallback renders
  correctly when Supabase isn't configured), verify:
  - Sidebar groups render, active link highlights correctly on `/admin`
    and on a nested route like `/admin/produtos/<id>`.
  - Resize to mobile width: hamburger appears, drawer opens/closes, closes
    on navigation.
  - Overview cards, revenue, chart, status breakdown, and both shortcut
    lists render with real or empty data without layout breakage.
