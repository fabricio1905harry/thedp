import { createClient } from "@/lib/supabase/server";
import { PASS_THROUGH_COMPONENTS, type PassThroughKey } from "@/lib/payments";

/**
 * Admin Dashboard metrics.
 *
 * Revenue rule: Revenue = MERCHANDISE value of CONFIRMED payments, dated by
 * the payment's confirmation (a Reserve paid 6k in May + 4k in June counts
 * 6k in May and 4k in June). Freight, insurance, DHL surcharges, duties,
 * export declaration, bank fees and other pass-through charges never enter
 * Revenue; they are reported separately (Total Collected + breakdown).
 *
 * Margin: each payment carries the product cost it recognised
 * (cogs_recognized_brl — 100% on the first payment of an order, 0 after),
 * so margins by period never change retroactively.
 *
 * Currencies: every value keeps its original currency in the database.
 * Consolidation converts with the rate snapshotted on the payment
 * (fx_rate_brl) for display only.
 */

export type PeriodKey = "today" | "7d" | "30d" | "this_month" | "this_year" | "custom";
export type CompareKey = "previous_period" | "previous_year" | "custom" | "none";
export type DisplayCurrency = "BRL" | "USD" | "EUR";
export type EvolutionWindow = "3m" | "6m" | "12m" | "year";

export const KPI_DEFS = [
  { key: "revenue", label: "Revenue / Faturamento", money: true },
  { key: "orders", label: "Orders", money: false },
  { key: "aov", label: "Average Order Value", money: true },
  { key: "productsSold", label: "Products Sold", money: false },
  { key: "itemsPerOrder", label: "Average Items per Order", money: false },
  { key: "grossMargin", label: "Gross Margin", money: true },
  { key: "grossMarginPct", label: "Gross Margin %", money: false },
  { key: "customers", label: "Customers", money: false },
  { key: "newCustomers", label: "New Customers", money: false },
  { key: "totalCollected", label: "Total Collected", money: true },
  { key: "reserveDeposits", label: "Reserve Deposits Collected", money: true },
  { key: "lostSalesValue", label: "Lost Sales — Out of Stock", money: true },
  { key: "recoveredSales", label: "Recovered Sales", money: true },
  { key: "chargebacks", label: "Chargebacks", money: false },
  { key: "cancellations", label: "Cancellations", money: false },
] as const;

export type KpiKey = (typeof KPI_DEFS)[number]["key"];
export type KpiValues = Record<KpiKey, number>;

export interface DateRange {
  from: Date;
  to: Date; // exclusive
}

export interface DashboardFilters {
  period: PeriodKey;
  range: DateRange;
  compare: CompareKey;
  compareRange: DateRange | null;
  channel: string;
  currency: DisplayCurrency;
  kpi: KpiKey;
  window: EvolutionWindow;
}

// ---------------------------------------------------------------------
// filters
// ---------------------------------------------------------------------

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function parseDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function periodRange(period: PeriodKey, now: Date, from?: string, to?: string): DateRange {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  switch (period) {
    case "today":
      return { from: today, to: tomorrow };
    case "7d":
      return { from: addDays(today, -6), to: tomorrow };
    case "this_month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: tomorrow };
    case "this_year":
      return { from: new Date(now.getFullYear(), 0, 1), to: tomorrow };
    case "custom": {
      const f = parseDate(from) ?? addDays(today, -29);
      const t = parseDate(to) ?? today;
      return { from: f, to: addDays(t, 1) };
    }
    case "30d":
    default:
      return { from: addDays(today, -29), to: tomorrow };
  }
}

export function comparisonRange(
  range: DateRange,
  compare: CompareKey,
  cfrom?: string,
  cto?: string
): DateRange | null {
  if (compare === "none") return null;
  if (compare === "previous_year") {
    const f = new Date(range.from);
    const t = new Date(range.to);
    f.setFullYear(f.getFullYear() - 1);
    t.setFullYear(t.getFullYear() - 1);
    return { from: f, to: t };
  }
  if (compare === "custom") {
    const f = parseDate(cfrom);
    const t = parseDate(cto);
    if (f && t) return { from: f, to: addDays(t, 1) };
  }
  const span = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - span), to: new Date(range.from) };
}

export function parseFilters(sp: Record<string, string | undefined>, now = new Date()): DashboardFilters {
  const period = (["today", "7d", "30d", "this_month", "this_year", "custom"].includes(sp.period ?? "")
    ? sp.period
    : "30d") as PeriodKey;
  const compare = (["previous_period", "previous_year", "custom", "none"].includes(sp.compare ?? "")
    ? sp.compare
    : "previous_period") as CompareKey;
  const range = periodRange(period, now, sp.from, sp.to);
  const kpi = (KPI_DEFS.some((k) => k.key === sp.kpi) ? sp.kpi : "revenue") as KpiKey;
  return {
    period,
    range,
    compare,
    compareRange: comparisonRange(range, compare, sp.cfrom, sp.cto),
    channel: sp.channel && sp.channel !== "all" ? sp.channel : "all",
    currency: (["BRL", "USD", "EUR"].includes(sp.currency ?? "") ? sp.currency : "USD") as DisplayCurrency,
    kpi,
    window: (["3m", "6m", "12m", "year"].includes(sp.window ?? "") ? sp.window : "12m") as EvolutionWindow,
  };
}

// ---------------------------------------------------------------------
// raw data
// ---------------------------------------------------------------------

interface PaymentRow {
  id: string;
  order_id: string;
  method_code: string;
  kind: string;
  status: string;
  currency: string;
  amount: number;
  received_amount: number | null;
  merchandise_amount: number;
  fx_rate_brl: number | null;
  cogs_recognized_brl: number;
  confirmed_at: string | null;
  updated_at: string;
  [component: string]: unknown;
}

interface OrderRow {
  id: string;
  order_number: string | null;
  status: string;
  currency: string;
  subtotal: number;
  total: number;
  channel: string | null;
  customer_id: string;
  created_at: string;
  confirmed_at: string | null;
  shipping_address: { countryCode?: string; country?: string } | null;
}

interface ItemRow {
  order_id: string;
  product_id: string | null;
  product_title: string | null;
  brand: string | null;
  qty: number;
  unit_price: number;
  item_status: string;
}

interface LostSaleRow {
  id: string;
  customer_id: string | null;
  quantity: number;
  potential_value: number;
  currency: string;
  channel: string | null;
  status: string;
  created_at: string;
  closed_at: string | null;
  recovered_revenue: number;
}

export interface DashboardRaw {
  payments: PaymentRow[];
  orders: OrderRow[];
  items: ItemRow[];
  lostSales: LostSaleRow[];
  cancellations: { reference_id: string; created_at: string }[];
  customers: Map<string, string>;
  rates: Record<string, number>; // BRL per unit, latest
}

const PAGE = 1000;

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await build(from, from + PAGE - 1);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function loadDashboardRaw(): Promise<DashboardRaw> {
  const supabase = await createClient();
  const componentCols = PASS_THROUGH_COMPONENTS.map((c) => c.key).join(", ");

  const [payments, orders, items, lostSales, cancellations, customerRows, fxRows] = await Promise.all([
    fetchAll<PaymentRow>((f, t) =>
      supabase
        .from("payments")
        .select(
          `id, order_id, method_code, kind, status, currency, amount, received_amount, merchandise_amount, ${componentCols}, fx_rate_brl, cogs_recognized_brl, confirmed_at, updated_at`
        )
        .in("status", ["confirmed", "refunded", "chargeback"])
        .order("id")
        .range(f, t) as unknown as PromiseLike<{ data: PaymentRow[] | null }>
    ),
    fetchAll<OrderRow>((f, t) =>
      supabase
        .from("orders")
        .select("id, order_number, status, currency, subtotal, total, channel, customer_id, created_at, confirmed_at, shipping_address")
        .order("id")
        .range(f, t) as unknown as PromiseLike<{ data: OrderRow[] | null }>
    ),
    fetchAll<ItemRow>((f, t) =>
      supabase
        .from("order_items")
        .select("order_id, product_id, product_title, brand, qty, unit_price, item_status")
        .order("id")
        .range(f, t) as unknown as PromiseLike<{ data: ItemRow[] | null }>
    ),
    fetchAll<LostSaleRow>((f, t) =>
      supabase
        .from("lost_sales")
        .select("id, customer_id, quantity, potential_value, currency, channel, status, created_at, closed_at, recovered_revenue")
        .order("id")
        .range(f, t) as unknown as PromiseLike<{ data: LostSaleRow[] | null }>
    ),
    fetchAll<{ reference_id: string; created_at: string }>((f, t) =>
      supabase
        .from("system_events")
        .select("reference_id, created_at")
        .eq("event_type", "order_canceled")
        .order("id")
        .range(f, t) as unknown as PromiseLike<{ data: { reference_id: string; created_at: string }[] | null }>
    ),
    fetchAll<{ id: string; company_name: string | null; name: string | null; email: string }>((f, t) =>
      supabase
        .from("customers")
        .select("id, company_name, name, email")
        .order("id")
        .range(f, t) as unknown as PromiseLike<{ data: { id: string; company_name: string | null; name: string | null; email: string }[] | null }>
    ),
    supabase.from("fx_rates").select("quote, rate, fetched_at").eq("base", "BRL").order("fetched_at", { ascending: false }).limit(20),
  ]);

  const rates: Record<string, number> = { BRL: 1 };
  for (const r of fxRows.data ?? []) {
    if (!(r.quote in rates)) rates[r.quote] = Number(r.rate);
  }

  return {
    payments,
    orders,
    items,
    lostSales,
    cancellations,
    customers: new Map(customerRows.map((c) => [c.id, c.company_name || c.name || c.email])),
    rates,
  };
}

// ---------------------------------------------------------------------
// computation
// ---------------------------------------------------------------------

export class Converter {
  constructor(
    private rates: Record<string, number>,
    private display: DisplayCurrency
  ) {}

  /** amount in `currency` → display currency; snapshot rate wins over latest. */
  convert(amount: number, currency: string, snapshotBrlRate?: number | null): number {
    const toBrl = snapshotBrlRate && snapshotBrlRate > 0 ? snapshotBrlRate : this.rates[currency.toUpperCase()];
    const displayRate = this.rates[this.display];
    if (!toBrl || !displayRate) return 0;
    return (Number(amount) * toBrl) / displayRate;
  }

  fromBrl(amountBrl: number): number {
    const displayRate = this.rates[this.display];
    return displayRate ? Number(amountBrl) / displayRate : 0;
  }

  get available() {
    return Boolean(this.rates[this.display]);
  }
}

function inRange(iso: string | null | undefined, range: DateRange) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= range.from.getTime() && t < range.to.getTime();
}

function activeItem(i: ItemRow) {
  return i.item_status === "available" || i.item_status === "requested";
}

export function computeKpis(raw: DashboardRaw, range: DateRange, channel: string, conv: Converter): KpiValues {
  const orderById = new Map(raw.orders.map((o) => [o.id, o]));
  const channelOk = (orderId: string) => channel === "all" || orderById.get(orderId)?.channel === channel;

  const confirmed = raw.payments.filter(
    (p) => p.status !== "chargeback" && p.confirmed_at && channelOk(p.order_id)
  );
  const inPeriod = confirmed.filter((p) => inRange(p.confirmed_at, range));

  let revenue = 0;
  let totalCollected = 0;
  let cogs = 0;
  let reserveDeposits = 0;
  for (const p of inPeriod) {
    revenue += conv.convert(p.merchandise_amount, p.currency, p.fx_rate_brl);
    totalCollected += conv.convert(p.received_amount ?? p.amount, p.currency, p.fx_rate_brl);
    cogs += conv.fromBrl(p.cogs_recognized_brl);
    if (p.kind === "reserve_deposit") reserveDeposits += conv.convert(p.merchandise_amount, p.currency, p.fx_rate_brl);
  }

  // Orders = orders whose first confirmed payment falls in the period.
  const firstPaymentByOrder = new Map<string, string>();
  for (const p of confirmed) {
    const prev = firstPaymentByOrder.get(p.order_id);
    if (!prev || p.confirmed_at! < prev) firstPaymentByOrder.set(p.order_id, p.confirmed_at!);
  }
  const ordersInPeriod = [...firstPaymentByOrder.entries()].filter(([, at]) => inRange(at, range)).map(([id]) => id);
  const orderSet = new Set(ordersInPeriod);
  const productsSold = raw.items.filter((i) => orderSet.has(i.order_id) && activeItem(i)).reduce((s, i) => s + Number(i.qty), 0);

  // Customers paying in the period; new = first-ever confirmed payment in it.
  const firstPaymentByCustomer = new Map<string, string>();
  for (const p of raw.payments.filter((x) => x.status !== "chargeback" && x.confirmed_at)) {
    const cid = orderById.get(p.order_id)?.customer_id;
    if (!cid) continue;
    const prev = firstPaymentByCustomer.get(cid);
    if (!prev || p.confirmed_at! < prev) firstPaymentByCustomer.set(cid, p.confirmed_at!);
  }
  const customers = new Set(inPeriod.map((p) => orderById.get(p.order_id)?.customer_id).filter(Boolean) as string[]);
  const newCustomers = [...customers].filter((cid) => inRange(firstPaymentByCustomer.get(cid), range)).length;

  const lost = raw.lostSales.filter((l) => (channel === "all" || l.channel === channel));
  const lostSalesValue = lost.filter((l) => inRange(l.created_at, range)).reduce((s, l) => s + conv.convert(l.potential_value, l.currency), 0);
  const recoveredSales = lost
    .filter((l) => l.status === "recovered" && inRange(l.closed_at, range))
    .reduce((s, l) => s + conv.convert(l.recovered_revenue, l.currency), 0);

  const chargebacks = raw.payments.filter((p) => p.status === "chargeback" && channelOk(p.order_id) && inRange(p.updated_at, range)).length;
  const cancellations = raw.cancellations.filter((c) => channelOk(c.reference_id) && inRange(c.created_at, range)).length;

  const grossMargin = revenue - cogs;
  return {
    revenue,
    orders: ordersInPeriod.length,
    aov: ordersInPeriod.length ? revenue / ordersInPeriod.length : 0,
    productsSold,
    itemsPerOrder: ordersInPeriod.length ? productsSold / ordersInPeriod.length : 0,
    grossMargin,
    grossMarginPct: revenue > 0 ? (grossMargin / revenue) * 100 : 0,
    customers: customers.size,
    newCustomers,
    totalCollected,
    reserveDeposits,
    lostSalesValue,
    recoveredSales,
    chargebacks,
    cancellations,
  };
}

export function pctChange(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function evolutionMonths(window: EvolutionWindow, now = new Date()): DateRange[] {
  const months: DateRange[] = [];
  if (window === "year") {
    for (let m = 0; m <= now.getMonth(); m++) {
      months.push({ from: new Date(now.getFullYear(), m, 1), to: new Date(now.getFullYear(), m + 1, 1) });
    }
    return months;
  }
  const n = window === "3m" ? 3 : window === "6m" ? 6 : 12;
  for (let i = n - 1; i >= 0; i--) {
    months.push({
      from: new Date(now.getFullYear(), now.getMonth() - i, 1),
      to: new Date(now.getFullYear(), now.getMonth() - i + 1, 1),
    });
  }
  return months;
}

export function passThroughBreakdown(raw: DashboardRaw, range: DateRange, channel: string, conv: Converter) {
  const orderById = new Map(raw.orders.map((o) => [o.id, o]));
  const totals = Object.fromEntries(PASS_THROUGH_COMPONENTS.map((c) => [c.key, 0])) as Record<PassThroughKey, number>;
  for (const p of raw.payments) {
    if (p.status === "chargeback" || !inRange(p.confirmed_at, range)) continue;
    if (channel !== "all" && orderById.get(p.order_id)?.channel !== channel) continue;
    for (const c of PASS_THROUGH_COMPONENTS) {
      totals[c.key] += conv.convert(Number(p[c.key] ?? 0), p.currency, p.fx_rate_brl);
    }
  }
  return totals;
}

export function paymentMix(raw: DashboardRaw, range: DateRange, channel: string, conv: Converter) {
  const orderById = new Map(raw.orders.map((o) => [o.id, o]));
  const byMethod = new Map<string, { count: number; value: number }>();
  for (const p of raw.payments) {
    if (p.status === "chargeback" || !inRange(p.confirmed_at, range)) continue;
    if (channel !== "all" && orderById.get(p.order_id)?.channel !== channel) continue;
    const cur = byMethod.get(p.method_code) ?? { count: 0, value: 0 };
    cur.count += 1;
    cur.value += conv.convert(p.received_amount ?? p.amount, p.currency, p.fx_rate_brl);
    byMethod.set(p.method_code, cur);
  }
  const totalCount = [...byMethod.values()].reduce((s, v) => s + v.count, 0);
  const totalValue = [...byMethod.values()].reduce((s, v) => s + v.value, 0);
  return [...byMethod.entries()]
    .map(([method, v]) => ({
      method,
      count: v.count,
      value: v.value,
      countPct: totalCount ? (v.count / totalCount) * 100 : 0,
      valuePct: totalValue ? (v.value / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

const OPEN_STATUSES = ["confirmed_awaiting_payment", "payment_coordination_required", "payment_window_expired", "reserved"];

/** Outstanding Order Value with aging (days since the Confirmed Order). */
export function outstandingAging(raw: DashboardRaw, channel: string, conv: Converter, now = new Date()) {
  const collected = new Map<string, number>();
  for (const p of raw.payments) {
    if (p.status !== "confirmed") continue;
    collected.set(p.order_id, (collected.get(p.order_id) ?? 0) + Number(p.merchandise_amount));
  }
  const buckets = [
    { key: "0-30", label: "0–30 days", min: 0, max: 30 },
    { key: "31-60", label: "31–60 days", min: 31, max: 60 },
    { key: "61-90", label: "61–90 days", min: 61, max: 90 },
    { key: "90+", label: "90+ days", min: 91, max: Infinity },
  ].map((b) => ({ ...b, value: 0, orders: [] as { id: string; ref: string; customer: string; value: number; days: number }[] }));

  let total = 0;
  let reservedValue = 0;
  let awaitingPayment = 0;
  for (const o of raw.orders) {
    if (!OPEN_STATUSES.includes(o.status)) continue;
    if (channel !== "all" && o.channel !== channel) continue;
    const open = Math.max(0, Number(o.subtotal) - (collected.get(o.id) ?? 0));
    if (open <= 0) continue;
    const value = conv.convert(open, o.currency);
    const days = Math.floor((now.getTime() - new Date(o.confirmed_at ?? o.created_at).getTime()) / 86400000);
    const bucket = buckets.find((b) => days >= b.min && days <= b.max) ?? buckets[buckets.length - 1];
    bucket.value += value;
    bucket.orders.push({ id: o.id, ref: o.order_number ?? o.id.slice(0, 8), customer: raw.customers.get(o.customer_id) ?? "—", value, days });
    total += value;
    if (o.status === "reserved") reservedValue += conv.convert(Number(o.subtotal), o.currency);
    if (o.status === "confirmed_awaiting_payment" || o.status === "payment_coordination_required") awaitingPayment += 1;
  }
  return { total, buckets, reservedValue, awaitingPayment };
}

/** Merchandise revenue allocated to lines pro-rata, for Top Products/Brands/Customers/Country/Channel. */
export function revenueBreakdowns(raw: DashboardRaw, range: DateRange, channel: string, conv: Converter) {
  const orderById = new Map(raw.orders.map((o) => [o.id, o]));
  const itemsByOrder = new Map<string, ItemRow[]>();
  for (const i of raw.items) {
    if (!activeItem(i)) continue;
    const list = itemsByOrder.get(i.order_id) ?? [];
    list.push(i);
    itemsByOrder.set(i.order_id, list);
  }

  const products = new Map<string, { label: string; value: number; units: number }>();
  const brands = new Map<string, number>();
  const customers = new Map<string, number>();
  const countries = new Map<string, number>();
  const channels = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

  // units are counted once per order, on its first confirmed payment
  const firstPayment = new Map<string, PaymentRow>();
  for (const p of raw.payments) {
    if (p.status === "chargeback" || !p.confirmed_at) continue;
    const prev = firstPayment.get(p.order_id);
    if (!prev || p.confirmed_at < prev.confirmed_at!) firstPayment.set(p.order_id, p);
  }

  for (const p of raw.payments) {
    if (p.status === "chargeback" || !inRange(p.confirmed_at, range)) continue;
    const order = orderById.get(p.order_id);
    if (!order || (channel !== "all" && order.channel !== channel)) continue;
    const value = conv.convert(p.merchandise_amount, p.currency, p.fx_rate_brl);
    add(customers, raw.customers.get(order.customer_id) ?? order.customer_id, value);
    add(countries, order.shipping_address?.countryCode ?? order.shipping_address?.country ?? "—", value);
    add(channels, order.channel ?? "—", value);

    const lines = itemsByOrder.get(order.id) ?? [];
    const base = lines.reduce((s, i) => s + Number(i.qty) * Number(i.unit_price), 0);
    for (const line of lines) {
      const share = base > 0 ? (Number(line.qty) * Number(line.unit_price)) / base : 0;
      const key = line.product_id ?? line.product_title ?? "—";
      const cur = products.get(key) ?? { label: line.product_title ?? "—", value: 0, units: 0 };
      cur.value += value * share;
      cur.units += firstPayment.get(order.id)?.id === p.id ? Number(line.qty) : 0;
      products.set(key, cur);
      add(brands, line.brand ?? "—", value * share);
    }
  }

  const top = (m: Map<string, number>, n = 8) =>
    [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, n);
  return {
    topProducts: [...products.values()].sort((a, b) => b.value - a.value).slice(0, 8),
    topBrands: top(brands),
    topCustomers: top(customers),
    byCountry: top(countries, 10),
    byChannel: top(channels, 4),
  };
}

/** Funnel over orders CREATED in the period: Order Request → Confirmed Order → Paid. */
export function funnelAndStatus(raw: DashboardRaw, range: DateRange, channel: string) {
  const paidOrders = new Set(raw.payments.filter((p) => p.status === "confirmed").map((p) => p.order_id));
  const created = raw.orders.filter((o) => inRange(o.created_at, range) && (channel === "all" || o.channel === channel));
  const statusCounts = new Map<string, number>();
  for (const o of created) statusCounts.set(o.status, (statusCounts.get(o.status) ?? 0) + 1);
  return {
    funnel: {
      requests: created.length,
      confirmed: created.filter((o) => o.confirmed_at).length,
      paid: created.filter((o) => paidOrders.has(o.id)).length,
    },
    statusCounts: [...statusCounts.entries()].sort((a, b) => b[1] - a[1]),
  };
}

export function lostSalesSummary(raw: DashboardRaw, range: DateRange, channel: string, conv: Converter) {
  const rows = raw.lostSales.filter((l) => inRange(l.created_at, range) && (channel === "all" || l.channel === channel));
  const all = raw.lostSales.filter((l) => channel === "all" || l.channel === channel);
  const recovered = all.filter((l) => l.status === "recovered").length;
  const closed = all.filter((l) => l.status === "recovered" || l.status === "not_recovered").length;
  return {
    value: rows.reduce((s, l) => s + conv.convert(l.potential_value, l.currency), 0),
    units: rows.reduce((s, l) => s + Number(l.quantity), 0),
    customers: new Set(rows.map((l) => l.customer_id)).size,
    restockOpportunities: all.filter((l) => l.status === "restock_opportunity").length,
    recoveryRate: closed ? (recovered / closed) * 100 : null,
  };
}
