"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addOrderItemBySku,
  confirmPayment,
  registerPayment,
  releaseOrderForPayment,
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
}: {
  order: OrderSummary;
  items: OrderItemRow[];
  payments: PaymentRow[];
  methods: MethodAvailability[];
  orderRules: Record<string, boolean>;
  bankFeeBrl: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const editable = EDITABLE_ORDER_STATUSES.includes(order.status);

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

      <PaymentsPanel order={order} payments={payments} methods={methods} bankFeeBrl={bankFeeBrl} pending={pending} run={run} />
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
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState(1);
  const [substitutes, setSubstitutes] = useState("");

  return (
    <div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted uppercase border-b border-border">
            <th className="py-2 pr-2">Product</th>
            <th className="py-2 pr-2">Color / Size</th>
            <th className="py-2 pr-2">Qty</th>
            <th className="py-2 pr-2">Unit</th>
            <th className="py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={`border-b border-border ${item.item_status === "removed" ? "opacity-50" : ""}`}>
              <td className="py-2 pr-2">
                {item.product_title ?? "—"}
                <span className="block text-muted font-mono">{item.sku}</span>
                {item.substitutes_item_id && <span className="block text-muted">substitution</span>}
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
              </td>
              <td className="py-2 pr-2">{money(item.unit_price, order.currency)}</td>
              <td className="py-2">
                {editable ? (
                  <select
                    value={item.item_status}
                    disabled={pending}
                    onChange={(e) => run(() => setOrderItemStatus(order.id, item.id, e.target.value as ItemStatus))}
                    className="border border-border px-1 py-0.5 max-w-[16rem]"
                  >
                    {Object.entries(ITEM_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  ITEM_STATUS_LABELS[item.item_status] ?? item.item_status
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-muted mt-1">
        OUT OF STOCK also makes the variant unavailable in the catalog and records a Lost Sale. ORDER ONLY / OTHER
        REASON affects only this order.
      </p>
      <p className="text-xs mt-2">
        Subtotal (merchandise): <strong>{money(order.subtotal, order.currency)}</strong> · Total:{" "}
        <strong>{money(order.total, order.currency)}</strong>
      </p>

      {editable && (
        <form
          className="flex flex-wrap items-end gap-2 mt-3 text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            if (!sku.trim()) return;
            run(async () => {
              await addOrderItemBySku(order.id, sku, qty, substitutes || undefined);
              setSku("");
              setSubstitutes("");
            });
          }}
        >
          <label className="flex flex-col">
            Add / substitute by SKU
            <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="product-M-RED" className="border border-border px-2 py-1 font-mono" />
          </label>
          <label className="flex flex-col">
            Qty
            <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="w-16 border border-border px-2 py-1" />
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
          <button type="submit" disabled={pending} className="border border-border px-3 py-1">
            Add
          </button>
        </form>
      )}
    </div>
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
  pending,
  run,
}: {
  order: OrderSummary;
  payments: PaymentRow[];
  methods: MethodAvailability[];
  bankFeeBrl: number;
  pending: boolean;
  run: Run;
}) {
  const enabled = methods.filter((m) => m.enabled);
  const [form, setForm] = useState<PaymentInput>({
    methodCode: enabled[0]?.method_code ?? "bank_transfer",
    kind: order.payment_mode === "reserve" ? "reserve_deposit" : "full",
    merchandiseAmount: order.payment_mode === "reserve" ? Number(order.reserve_amount ?? 0) : Number(order.subtotal),
    // freight & duties as informed on the order (adjust if split across payments)
    freightAmount: Number(order.freight_amount) || undefined,
    insuranceAmount: Number(order.insurance_amount) || undefined,
    fuelSurchargeAmount: Number(order.fuel_surcharge_amount) || undefined,
    demandSurchargeAmount: Number(order.demand_surcharge_amount) || undefined,
    exportDeclarationAmount: Number(order.export_declaration_amount) || undefined,
    otherDhlAmount: Number(order.other_dhl_amount) || undefined,
    dutiesTaxesAmount: Number(order.duties_taxes_amount) || undefined,
    otherChargesAmount: Number(order.other_charges_amount) || undefined,
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
            {enabled.map((m) => (
              <option key={m.method_code} value={m.method_code}>
                {m.method_name}
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
        <button type="submit" disabled={pending || enabled.length === 0} className="btn-primary px-3 py-1.5 col-span-2 md:col-span-1">
          Register payment
        </button>
      </form>
    </section>
  );
}
