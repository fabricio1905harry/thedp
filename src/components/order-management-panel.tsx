"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addOrderItemBySku,
  confirmPayment,
  registerPayment,
  releaseOrderForPayment,
  reopenOrderForEditing,
  restoreOrderItem,
  searchVariantsForOrder,
  setOrderItemPrice,
  setOrderItemQty,
  setOrderItemStatus,
  setOrderPaymentRule,
  setOrderStage,
  setPaymentStatus,
  setOrderCharges,
  setReserveMode,
  type ItemStatus,
  type OrderChargesInput,
  type PaymentInput,
  type VariantSearchResult,
} from "@/app/admin/pedidos/actions";
import { EDITABLE_ORDER_STATUSES, ITEM_STATUS_LABELS, STOCK_HOLD_LABELS } from "@/lib/order-status";
import { PASS_THROUGH_COMPONENTS, PAYMENT_METHOD_LABELS } from "@/lib/payments";

export interface OrderItemRow {
  id: string;
  qty: number;
  unit_price: number;
  item_status: ItemStatus;
  unavailable_note: string | null;
  product_title: string | null;
  sku: string | null;
  color: string | null;
  size: string | null;
  substitutes_item_id: string | null;
  added_by_tdp: boolean;
  original_qty: number | null;
  original_unit_price: number | null;
}

export interface OrderEventRow {
  id: string;
  event_type: string;
  summary: string;
  created_at: string;
  customers: { email: string } | null;
}

export interface PaymentRow {
  id: string;
  method_code: string;
  kind: string;
  status: string;
  currency: string;
  amount: number;
  merchandise_amount: number;
  bank_fee_amount: number;
  received_amount: number | null;
  cogs_recognized_brl: number;
  confirmed_at: string | null;
  created_at: string;
  external_ref: string | null;
}

export interface MethodAvailability {
  method_code: string;
  method_name: string;
  enabled: boolean;
  decided_by: string;
}

export interface OrderSummary {
  id: string;
  status: string;
  currency: string;
  subtotal: number;
  total: number;
  payment_mode: string;
  reserve_amount: number | null;
  reserve_pct_of_sale: number | null;
  stock_hold_type: string | null;
  stock_hold_until: string | null;
  shipping_cost: number;
  duties_estimate: number;
  freight_amount: number;
  insurance_amount: number;
  fuel_surcharge_amount: number;
  demand_surcharge_amount: number;
  export_declaration_amount: number;
  other_dhl_amount: number;
  duties_taxes_amount: number;
  other_charges_amount: number;
  delivery_days: number | null;
  charges_note: string | null;
  charges_informed_at: string | null;
  original_subtotal: number | null;
  quote_snapshot: { packaging?: { number_of_packages?: number; packages?: { packaging_name?: string; final_weight_kg?: number }[] } } | null;
}

function money(v: number | null | undefined, currency: string) {
  return `${Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function OrderManagementPanel({
  order,
  items,
  payments,
  methods,
  orderRules,
  bankFeeBrl,
  events,
  outstandingMerchandise,
}: {
  order: OrderSummary;
  items: OrderItemRow[];
  payments: PaymentRow[];
  methods: MethodAvailability[];
  orderRules: Record<string, boolean>;
  bankFeeBrl: number;
  events: OrderEventRow[];
  outstandingMerchandise: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const editable = EDITABLE_ORDER_STATUSES.includes(order.status);
  const hasLivePayment = payments.some((p) => p.status === "pending_verification" || p.status === "confirmed");
  const canReopen =
    !editable &&
    !hasLivePayment &&
    ["confirmed_awaiting_payment", "payment_coordination_required", "payment_window_expired"].includes(order.status);

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      }
    });
  }

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-red-600 border border-red-300 p-2">{error}</p>}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-medium uppercase tracking-wide">Order composition</h2>
          {canReopen && (
            <button type="button" disabled={pending} onClick={() => run(() => reopenOrderForEditing(order.id))} className="border border-foreground px-2 py-1 text-xs font-medium">
              Reopen for editing
            </button>
          )}
          {editable && (
            <div className="flex gap-2 text-xs">
              <button type="button" disabled={pending} onClick={() => run(() => setOrderStage(order.id, "stock_confirmation"))} className="border border-border px-2 py-1">
                Mark: confirming stock
              </button>
              <button type="button" disabled={pending} onClick={() => run(() => setOrderStage(order.id, "awaiting_buyer_decision"))} className="border border-border px-2 py-1">
                Mark: waiting buyer decision
              </button>
            </div>
          )}
        </div>
        <ItemsTable order={order} items={items} editable={editable} pending={pending} run={run} />
      </section>

      <ChargesPanel key={order.charges_informed_at ?? "none"} order={order} editable={editable} pending={pending} run={run} />

      <ReleasePanel order={order} editable={editable} pending={pending} run={run} />

      <PaymentMethodsPanel order={order} methods={methods} orderRules={orderRules} pending={pending} run={run} />

      <PaymentsPanel
        key={`${payments.length}-${payments.map((p) => p.status).join("")}-${order.total}-${outstandingMerchandise}`}
        order={order}
        payments={payments}
        methods={methods}
        bankFeeBrl={bankFeeBrl}
        outstandingMerchandise={outstandingMerchandise}
        pending={pending}
        run={run}
      />

      <OrderHistoryPanel order={order} items={items} events={events} />
    </div>
  );
}

type Run = (fn: () => Promise<unknown>) => void;

function ItemsTable({
  order,
  items,
  editable,
  pending,
  run,
}: {
  order: OrderSummary;
  items: OrderItemRow[];
  editable: boolean;
  pending: boolean;
  run: Run;
}) {
  const live = items.filter((i) => i.item_status === "available" || i.item_status === "requested");
  const currentSubtotal = live.reduce((s, i) => s + Number(i.qty) * Number(i.unit_price), 0);
  const originalSubtotal = Number(order.original_subtotal ?? 0);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[760px]">
          <thead>
            <tr className="text-left text-muted uppercase border-b border-border">
              <th className="py-2 pr-2">Product</th>
              <th className="py-2 pr-2">Color / Size</th>
              <th className="py-2 pr-2">Qty</th>
              <th className="py-2 pr-2">Unit price ({order.currency})</th>
              <th className="py-2 pr-2 text-right">Line total</th>
              <th className="py-2">Status</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <ItemRow key={`${item.id}-${item.qty}-${item.unit_price}-${item.item_status}`} order={order} item={item} items={items} editable={editable} pending={pending} run={run} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted mt-1">
        The buyer&apos;s original request is always kept (shown under each changed line and in the history below).
        EM FALTA (OUT OF STOCK) also makes the variant unavailable in the catalog and records a Lost Sale. ORDER ONLY /
        OTHER REASON affects only this order.
      </p>
      <p className="text-xs mt-2">
        Subtotal (merchandise): <strong>{money(currentSubtotal, order.currency)}</strong>
        {Math.abs(currentSubtotal - originalSubtotal) > 0.004 && (
          <span className="text-muted"> · original request {money(originalSubtotal, order.currency)}</span>
        )}
        {" "}· Total with freight & duties: <strong>{money(order.total, order.currency)}</strong>
      </p>

      {editable && <AddItemForm order={order} items={items} pending={pending} run={run} />}
    </div>
  );
}

function ItemRow({
  order,
  item,
  items,
  editable,
  pending,
  run,
}: {
  order: OrderSummary;
  item: OrderItemRow;
  items: OrderItemRow[];
  editable: boolean;
  pending: boolean;
  run: Run;
}) {
  const inactive = item.item_status !== "available" && item.item_status !== "requested";
  const qtyChanged = item.original_qty !== null && item.original_qty !== item.qty;
  const priceChanged = item.original_unit_price !== null && Number(item.original_unit_price) !== Number(item.unit_price);
  const differs = qtyChanged || priceChanged || (item.original_qty !== null && item.item_status !== "requested" && item.item_status !== "available");
  const substitutedFor = item.substitutes_item_id ? items.find((i) => i.id === item.substitutes_item_id) : null;

  return (
    <tr className={`border-b border-border align-top ${inactive ? "opacity-60" : ""}`}>
      <td className="py-2 pr-2">
        <span className={inactive ? "line-through" : ""}>{item.product_title ?? "—"}</span>
        <span className="block text-muted font-mono">{item.sku}</span>
        {item.added_by_tdp && <span className="block text-[10px] uppercase text-accent">added by TDP</span>}
        {substitutedFor && (
          <span className="block text-[10px] text-muted">substitutes {substitutedFor.product_title} {substitutedFor.color}/{substitutedFor.size}</span>
        )}
      </td>
      <td className="py-2 pr-2">
        {item.color ?? "—"} / {item.size ?? "—"}
      </td>
      <td className="py-2 pr-2">
        {editable ? (
          <input
            type="number"
            min={1}
            defaultValue={item.qty}
            disabled={pending}
            onBlur={(e) => {
              const next = Number(e.target.value);
              if (next !== item.qty) run(() => setOrderItemQty(order.id, item.id, next));
            }}
            className="w-14 border border-border px-1 py-0.5"
          />
        ) : (
          item.qty
        )}
        {qtyChanged && <span className="block text-[10px] text-muted">was {item.original_qty}</span>}
      </td>
      <td className="py-2 pr-2">
        {editable ? (
          <input
            type="number"
            min={0}
            step="0.01"
            defaultValue={Number(item.unit_price)}
            disabled={pending}
            onBlur={(e) => {
              const next = Number(e.target.value);
              if (Number.isFinite(next) && next !== Number(item.unit_price)) run(() => setOrderItemPrice(order.id, item.id, next));
            }}
            className="w-24 border border-border px-1 py-0.5"
          />
        ) : (
          money(item.unit_price, order.currency)
        )}
        {priceChanged && <span className="block text-[10px] text-muted">was {money(item.original_unit_price, order.currency)}</span>}
      </td>
      <td className="py-2 pr-2 text-right whitespace-nowrap">{money(Number(item.qty) * Number(item.unit_price), order.currency)}</td>
      <td className="py-2 pr-2">
        {editable ? (
          <div className="flex flex-col gap-1">
            <select
              value={item.item_status}
              disabled={pending}
              onChange={(e) => run(() => setOrderItemStatus(order.id, item.id, e.target.value as ItemStatus))}
              className="border border-border px-1 py-0.5 max-w-[15rem]"
            >
              {Object.entries(ITEM_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {item.item_status !== "unavailable_out_of_stock" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => setOrderItemStatus(order.id, item.id, "unavailable_out_of_stock"))}
                className="text-left underline text-red-700"
              >
                Marcar em falta (out of stock)
              </button>
            )}
          </div>
        ) : (
          ITEM_STATUS_LABELS[item.item_status] ?? item.item_status
        )}
      </td>
      <td className="py-2 whitespace-nowrap">
        {editable && differs && item.original_qty !== null && (
          <button type="button" disabled={pending} onClick={() => run(() => restoreOrderItem(order.id, item.id))} className="underline">
            Restore original
          </button>
        )}
      </td>
    </tr>
  );
}

function AddItemForm({
  order,
  items,
  pending,
  run,
}: {
  order: OrderSummary;
  items: OrderItemRow[];
  pending: boolean;
  run: Run;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VariantSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<VariantSearchResult | null>(null);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState("");
  const [substitutes, setSubstitutes] = useState("");

  async function search(value: string) {
    setQuery(value);
    setPicked(null);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      setResults(await searchVariantsForOrder(order.id, value));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function pick(r: VariantSearchResult) {
    setPicked(r);
    setPrice(r.price !== null ? String(r.price) : "");
    setResults([]);
    setQuery(`${r.title} — ${r.color ?? "—"} / ${r.size ?? "—"}`);
  }

  return (
    <form
      className="border border-border p-3 mt-3 text-xs space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!picked) return;
        run(async () => {
          await addOrderItemBySku(order.id, picked.sku, qty, substitutes || undefined, price === "" ? undefined : Number(price));
          setQuery("");
          setPicked(null);
          setPrice("");
          setSubstitutes("");
          setQty(1);
        });
      }}
    >
      <p className="font-medium">Add a piece / substitute a line</p>
      <div className="relative">
        <input
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="Search by product name or SKU…"
          className="w-full border border-border px-2 py-1"
        />
        {(results.length > 0 || searching) && (
          <ul className="absolute z-10 left-0 right-0 bg-background border border-border max-h-56 overflow-auto shadow">
            {searching && <li className="px-2 py-1 text-muted">Searching…</li>}
            {results.map((r) => (
              <li key={r.sku}>
                <button type="button" onClick={() => pick(r)} className="w-full text-left px-2 py-1 hover:bg-surface">
                  {r.title} — {r.color ?? "—"} / {r.size ?? "—"}{" "}
                  <span className="text-muted font-mono">{r.sku}</span>{" "}
                  <span className="text-muted">
                    · stock {r.stock} · {r.price !== null ? money(r.price, order.currency) : "no price"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col">
          Qty
          <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="w-16 border border-border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          Unit price ({order.currency})
          <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="w-28 border border-border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          Replaces line (optional)
          <select value={substitutes} onChange={(e) => setSubstitutes(e.target.value)} className="border border-border px-2 py-1">
            <option value="">— new line —</option>
            {items
              .filter((i) => i.item_status !== "removed")
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.product_title} {i.color}/{i.size}
                </option>
              ))}
          </select>
        </label>
        <button type="submit" disabled={pending || !picked} className="border border-foreground px-3 py-1 font-medium disabled:opacity-40">
          Add to order
        </button>
      </div>
    </form>
  );
}

function OrderHistoryPanel({ order, items, events }: { order: OrderSummary; items: OrderItemRow[]; events: OrderEventRow[] }) {
  const original = items.filter((i) => i.original_qty !== null);
  return (
    <section>
      <h2 className="text-sm font-medium uppercase tracking-wide mb-2">Original request & change history</h2>
      <details className="mb-3 text-xs" open={false}>
        <summary className="cursor-pointer">
          Original request — {money(order.original_subtotal, order.currency)} ({original.length} line(s))
        </summary>
        <ul className="mt-1 ml-3 space-y-0.5">
          {original.map((i) => (
            <li key={i.id}>
              {i.original_qty} × {i.product_title} {i.color}/{i.size} @ {money(i.original_unit_price, order.currency)}
            </li>
          ))}
        </ul>
      </details>
      {events.length === 0 ? (
        <p className="text-xs text-muted">No changes recorded yet.</p>
      ) : (
        <ul className="text-xs space-y-1">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-3">
              <span className="text-muted whitespace-nowrap">{new Date(e.created_at).toLocaleString("pt-BR")}</span>
              <span>{e.summary}</span>
              <span className="text-muted">{e.customers?.email ?? ""}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const CHARGE_FIELDS: { key: keyof OrderChargesInput; column: keyof OrderSummary; label: string }[] = [
  { key: "freightAmount", column: "freight_amount", label: "Freight (DHL)" },
  { key: "fuelSurchargeAmount", column: "fuel_surcharge_amount", label: "Fuel surcharge" },
  { key: "demandSurchargeAmount", column: "demand_surcharge_amount", label: "Demand surcharge" },
  { key: "otherDhlAmount", column: "other_dhl_amount", label: "Other DHL charges" },
  { key: "insuranceAmount", column: "insurance_amount", label: "Insurance" },
  { key: "exportDeclarationAmount", column: "export_declaration_amount", label: "Export declaration" },
  { key: "dutiesTaxesAmount", column: "duties_taxes_amount", label: "Import duties & taxes (DDP)" },
  { key: "otherChargesAmount", column: "other_charges_amount", label: "Other operational charges" },
];

/**
 * Freight & import duties, informed by the TDP after confirming stock.
 * The buyer sees "to be informed after stock confirmation" until saved.
 */
function ChargesPanel({ order, editable, pending, run }: { order: OrderSummary; editable: boolean; pending: boolean; run: Run }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      CHARGE_FIELDS.map((f) => [f.key, order.charges_informed_at ? String(Number(order[f.column] ?? 0)) : ""])
    )
  );
  const [deliveryDays, setDeliveryDays] = useState(order.delivery_days ? String(order.delivery_days) : "");
  const [note, setNote] = useState(order.charges_note ?? "");
  const pkg = order.quote_snapshot?.packaging;
  const charges = CHARGE_FIELDS.reduce((sum, f) => sum + Number(values[f.key] || 0), 0);

  return (
    <section id="charges" className="border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 className="text-sm font-medium uppercase tracking-wide">Freight & import duties ({order.currency})</h2>
        <span className={`text-[11px] px-2 py-0.5 ${order.charges_informed_at ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
          {order.charges_informed_at
            ? `Informed ${new Date(order.charges_informed_at).toLocaleString("pt-BR")}`
            : "Not informed — buyer sees “to be informed after stock confirmation”"}
        </span>
      </div>
      {pkg && (
        <p className="text-[11px] text-muted mb-2">
          Suggested packaging: {pkg.number_of_packages ?? "?"} volume(s)
          {pkg.packages?.[0]?.packaging_name ? ` · ${pkg.packages[0].packaging_name}` : ""}
          {pkg.packages?.[0]?.final_weight_kg ? ` · ${pkg.packages[0].final_weight_kg} kg` : ""}
        </p>
      )}
      <form
        className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs"
        onSubmit={(e) => {
          e.preventDefault();
          const input = Object.fromEntries(CHARGE_FIELDS.map((f) => [f.key, Number(values[f.key] || 0)])) as unknown as OrderChargesInput;
          input.deliveryDays = deliveryDays ? Number(deliveryDays) : null;
          input.note = note;
          run(() => setOrderCharges(order.id, input));
        }}
      >
        {CHARGE_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col">
            {f.label}
            <input
              type="number"
              step="0.01"
              min="0"
              disabled={!editable || pending}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder="0.00"
              className="border border-border px-2 py-1"
            />
          </label>
        ))}
        <label className="flex flex-col">
          DHL delivery (business days)
          <input type="number" min="1" disabled={!editable || pending} value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} className="border border-border px-2 py-1" />
        </label>
        <label className="flex flex-col col-span-2 md:col-span-3">
          Note (internal)
          <input disabled={!editable || pending} value={note} onChange={(e) => setNote(e.target.value)} placeholder="DHL quote ref., service…" className="border border-border px-2 py-1" />
        </label>
        <p className="col-span-2 md:col-span-3 self-end">
          Products {money(order.subtotal, order.currency)} + charges {money(charges, order.currency)} ={" "}
          <strong>{money(Number(order.subtotal) + charges, order.currency)}</strong>
        </p>
        {editable && (
          <button type="submit" disabled={pending} className="btn-primary px-3 py-1.5">
            Save freight & duties
          </button>
        )}
      </form>
      <p className="text-[11px] text-muted mt-2">
        Required before generating the Confirmed Order. Kept separate from revenue (Dashboard → operational charges).
      </p>
    </section>
  );
}

function ReleasePanel({ order, editable, pending, run }: { order: OrderSummary; editable: boolean; pending: boolean; run: Run }) {
  const [hold, setHold] = useState<"24h" | "48h" | "custom" | "cannot_reserve">("48h");
  const [customUntil, setCustomUntil] = useState("");

  return (
    <section className="border border-border p-4">
      <h2 className="text-sm font-medium uppercase tracking-wide mb-2">Confirmed Order & Temporary Stock Hold</h2>
      {order.stock_hold_type && (
        <p className="text-xs mb-2">
          Current: <strong>{STOCK_HOLD_LABELS[order.stock_hold_type]}</strong>
          {order.stock_hold_until && <> — Inventory Reserved Until {new Date(order.stock_hold_until).toLocaleString("pt-BR")}</>}
        </p>
      )}
      {editable ? (
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label className="flex flex-col">
            Can the supplier hold the pieces?
            <select value={hold} onChange={(e) => setHold(e.target.value as typeof hold)} className="border border-border px-2 py-1">
              {Object.entries(STOCK_HOLD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {hold === "custom" && (
            <label className="flex flex-col">
              Hold until
              <input type="datetime-local" value={customUntil} onChange={(e) => setCustomUntil(e.target.value)} className="border border-border px-2 py-1" />
            </label>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => releaseOrderForPayment(order.id, hold, customUntil || undefined))}
            className="btn-primary px-3 py-1.5"
          >
            {order.status === "payment_window_expired" || order.status === "payment_coordination_required"
              ? "Stock reconfirmed — reopen payment"
              : "Generate Confirmed Order"}
          </button>
          <p className="w-full text-muted">
            The hold starts when the Confirmed Order is released. Expired windows disable payment and go to the
            Action Center. Recalculate DHL/costs before reopening an expired or coordination order.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted">Already released.</p>
      )}
      <div className="mt-3 text-xs flex flex-wrap items-center gap-3">
        <span>
          Mode: <strong>{order.payment_mode === "reserve" ? "Reserve for Later Delivery" : "Standard"}</strong>
          {order.payment_mode === "reserve" && order.reserve_amount !== null && (
            <> — reserve {money(order.reserve_amount, order.currency)} ({order.reserve_pct_of_sale}% of sale)</>
          )}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setReserveMode(order.id, order.payment_mode !== "reserve"))}
          className="underline"
        >
          {order.payment_mode === "reserve" ? "Switch to standard" : "Use Reserve (cost + %)"}
        </button>
      </div>
    </section>
  );
}

function PaymentMethodsPanel({
  order,
  methods,
  orderRules,
  pending,
  run,
}: {
  order: OrderSummary;
  methods: MethodAvailability[];
  orderRules: Record<string, boolean>;
  pending: boolean;
  run: Run;
}) {
  return (
    <section>
      <h2 className="text-sm font-medium uppercase tracking-wide mb-2">Payment methods for this order</h2>
      <p className="text-[11px] text-muted mb-2">Channel default → customer exception → order exception (most specific wins).</p>
      <table className="text-xs">
        <tbody>
          {methods.map((m) => {
            const rule = orderRules[m.method_code];
            const value = rule === undefined ? "inherit" : rule ? "on" : "off";
            return (
              <tr key={m.method_code}>
                <td className="pr-4 py-1">{m.method_name}</td>
                <td className="pr-4 py-1">
                  <strong>{m.enabled ? "Enabled" : "Disabled"}</strong> <span className="text-muted">({m.decided_by})</span>
                </td>
                <td className="py-1">
                  <select
                    value={value}
                    disabled={pending}
                    onChange={(e) =>
                      run(() =>
                        setOrderPaymentRule(order.id, m.method_code, e.target.value === "inherit" ? null : e.target.value === "on")
                      )
                    }
                    className="border border-border px-1 py-0.5"
                  >
                    <option value="inherit">Order: inherit</option>
                    <option value="on">Order: allow</option>
                    <option value="off">Order: block</option>
                  </select>
                </td>
                <td className="py-1 pl-3">
                  {m.method_code === "stripe_card" && !m.enabled && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => setOrderPaymentRule(order.id, "stripe_card", true))}
                      className="underline font-medium"
                    >
                      Enable Stripe for this order
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function PaymentsPanel({
  order,
  payments,
  methods,
  bankFeeBrl,
  outstandingMerchandise,
  pending,
  run,
}: {
  order: OrderSummary;
  payments: PaymentRow[];
  methods: MethodAvailability[];
  bankFeeBrl: number;
  outstandingMerchandise: number;
  pending: boolean;
  run: Run;
}) {
  const enabled = methods.filter((m) => m.enabled);
  // Defaults: a Reserve deposit carries merchandise only; freight & duties
  // go with the first payment after it (or the full payment) and are not
  // repeated once a non-deposit payment is confirmed.
  const depositConfirmed = payments.some((p) => p.status === "confirmed" && p.kind === "reserve_deposit");
  const chargesCollected = payments.some((p) => p.status === "confirmed" && p.kind !== "reserve_deposit");
  const isReserveDeposit = order.payment_mode === "reserve" && !depositConfirmed;
  const withCharges = !isReserveDeposit && !chargesCollected;
  const chargeDefault = (value: number) => (withCharges ? Number(value) || undefined : undefined);
  const [form, setForm] = useState<PaymentInput>({
    methodCode: enabled[0]?.method_code ?? methods[0]?.method_code ?? "bank_transfer",
    kind: isReserveDeposit ? "reserve_deposit" : depositConfirmed ? "balance" : "full",
    merchandiseAmount: isReserveDeposit ? Number(order.reserve_amount ?? 0) : Math.max(0, outstandingMerchandise),
    freightAmount: chargeDefault(order.freight_amount),
    insuranceAmount: chargeDefault(order.insurance_amount),
    fuelSurchargeAmount: chargeDefault(order.fuel_surcharge_amount),
    demandSurchargeAmount: chargeDefault(order.demand_surcharge_amount),
    exportDeclarationAmount: chargeDefault(order.export_declaration_amount),
    otherDhlAmount: chargeDefault(order.other_dhl_amount),
    dutiesTaxesAmount: chargeDefault(order.duties_taxes_amount),
    otherChargesAmount: chargeDefault(order.other_charges_amount),
  });
  const [received, setReceived] = useState<Record<string, string>>({});

  const setNum = (key: keyof PaymentInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value === "" ? undefined : Number(e.target.value) }));

  const camel: Record<string, keyof PaymentInput> = {
    freight_amount: "freightAmount",
    insurance_amount: "insuranceAmount",
    fuel_surcharge_amount: "fuelSurchargeAmount",
    demand_surcharge_amount: "demandSurchargeAmount",
    export_declaration_amount: "exportDeclarationAmount",
    other_dhl_amount: "otherDhlAmount",
    duties_taxes_amount: "dutiesTaxesAmount",
    other_charges_amount: "otherChargesAmount",
  };

  return (
    <section id="payments">
      <h2 className="text-sm font-medium uppercase tracking-wide mb-2">Payments (one row per transaction)</h2>
      {payments.length === 0 ? (
        <p className="text-xs text-muted mb-3">No payments yet.</p>
      ) : (
        <table className="w-full text-xs mb-4">
          <thead>
            <tr className="text-left text-muted uppercase border-b border-border">
              <th className="py-1 pr-2">Method / kind</th>
              <th className="py-1 pr-2">Merchandise</th>
              <th className="py-1 pr-2">Bank fee</th>
              <th className="py-1 pr-2">Total</th>
              <th className="py-1 pr-2">Status</th>
              <th className="py-1">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-border">
                <td className="py-1 pr-2">
                  {PAYMENT_METHOD_LABELS[p.method_code] ?? p.method_code} · {p.kind}
                </td>
                <td className="py-1 pr-2">{money(p.merchandise_amount, p.currency)}</td>
                <td className="py-1 pr-2">{money(p.bank_fee_amount, p.currency)}</td>
                <td className="py-1 pr-2">
                  {money(p.amount, p.currency)}
                  {p.received_amount !== null && Number(p.received_amount) !== Number(p.amount) && (
                    <span className="block text-red-600">received {money(p.received_amount, p.currency)}</span>
                  )}
                </td>
                <td className="py-1 pr-2 uppercase">{p.status.replace(/_/g, " ")}</td>
                <td className="py-1 space-x-2">
                  {p.status === "pending_verification" && (
                    <>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="received"
                        value={received[p.id] ?? ""}
                        onChange={(e) => setReceived((r) => ({ ...r, [p.id]: e.target.value }))}
                        className="w-20 border border-border px-1"
                      />
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(() => confirmPayment(order.id, p.id, received[p.id] ? Number(received[p.id]) : undefined))
                        }
                        className="underline"
                      >
                        Confirm
                      </button>
                      <button type="button" disabled={pending} onClick={() => run(() => setPaymentStatus(order.id, p.id, "rejected"))} className="underline">
                        Reject
                      </button>
                    </>
                  )}
                  {p.status === "confirmed" && (
                    <>
                      <button type="button" disabled={pending} onClick={() => run(() => setPaymentStatus(order.id, p.id, "refunded"))} className="underline">
                        Refunded
                      </button>
                      <button type="button" disabled={pending} onClick={() => run(() => setPaymentStatus(order.id, p.id, "chargeback"))} className="underline">
                        Chargeback
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form
        className="border border-border p-3 text-xs grid grid-cols-2 md:grid-cols-4 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => registerPayment(order.id, form));
        }}
      >
        <label className="flex flex-col">
          Method
          <select value={form.methodCode} onChange={(e) => setForm((f) => ({ ...f, methodCode: e.target.value }))} className="border border-border px-1 py-1">
            {methods.map((m) => (
              <option key={m.method_code} value={m.method_code}>
                {m.method_name}
                {m.enabled ? "" : " (not enabled for the buyer)"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          Kind
          <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as PaymentInput["kind"] }))} className="border border-border px-1 py-1">
            <option value="full">Full</option>
            <option value="reserve_deposit">Reserve deposit</option>
            <option value="balance">Balance</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="flex flex-col">
          Merchandise ({order.currency})
          <input type="number" step="0.01" value={form.merchandiseAmount ?? ""} onChange={setNum("merchandiseAmount")} className="border border-border px-1 py-1" />
        </label>
        {PASS_THROUGH_COMPONENTS.filter((c) => c.key !== "bank_fee_amount").map((c) => (
          <label key={c.key} className="flex flex-col">
            {c.label.replace(" Collected", "")}
            <input type="number" step="0.01" value={(form[camel[c.key]] as number | undefined) ?? ""} onChange={setNum(camel[c.key])} className="border border-border px-1 py-1" />
          </label>
        ))}
        <p className="col-span-2 md:col-span-4 text-muted">
          Bank Transfer adds one Bank Processing Fee per transfer (R$ {bankFeeBrl.toFixed(2)} converted to {order.currency}).
        </p>
        <div className="col-span-2 md:col-span-4 flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending || enabled.length === 0} className="border border-border px-3 py-1.5">
            Register payment (to verify)
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => registerPayment(order.id, { ...form, confirmNow: true }))}
            className="btn-primary px-3 py-1.5"
          >
            Payment received — mark as paid
          </button>
          <span className="text-muted">
            “Mark as paid” records the money as confirmed now (any method) and sets the order to PAID once the
            merchandise is fully covered.
          </span>
        </div>
      </form>
    </section>
  );
}
