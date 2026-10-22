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
import { PaymentProofLink } from "@/components/payment-proof-link";

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
  proof_path?: string | null;
  proof_name?: string | null;
  proof_uploaded_at?: string | null;
}

export interface PaymentAttemptRow {
  id: string;
  status: string;
  source: string;
  message: string | null;
  amount: number | null;
  currency: string | null;
  created_at: string;
}

const ATTEMPT_STATUS_LABELS: Record<string, string> = {
  failed: "Cartão recusado / falhou",
  canceled: "Cancelado pelo comprador",
  expired: "Link de pagamento expirou",
};

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
  attempts = [],
}: {
  attempts?: PaymentAttemptRow[];
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
        const res = await fn();
        if (res && typeof res === "object" && "error" in res && (res as { error?: string }).error) {
          setError((res as { error: string }).error);
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha na ação.");
      }
    });
  }

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-red-600 border border-red-300 p-2">{error}</p>}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-medium uppercase tracking-wide">Composição do pedido</h2>
          {canReopen && (
            <button type="button" disabled={pending} onClick={() => run(() => reopenOrderForEditing(order.id))} className="border border-foreground px-2 py-1 text-xs font-medium">
              Reabrir para edição
            </button>
          )}
          {editable && (
            <div className="flex gap-2 text-xs">
              <button type="button" disabled={pending} onClick={() => run(() => setOrderStage(order.id, "stock_confirmation"))} className="border border-border px-2 py-1">
                Marcar: confirmando estoque
              </button>
              <button type="button" disabled={pending} onClick={() => run(() => setOrderStage(order.id, "awaiting_buyer_decision"))} className="border border-border px-2 py-1">
                Marcar: aguardando decisão do comprador
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
        attempts={attempts}
        pending={pending}
        run={run}
      />

      <OrderHistoryPanel order={order} items={items} events={events} />
    </div>
  );
}

type Run = (fn: () => Promise<unknown>) => void;

const DECIDED_BY_LABELS: Record<string, string> = {
  channel: "canal",
  customer: "cliente",
  order: "pedido",
  none: "nenhuma regra",
};

const PAYMENT_KIND_LABELS: Record<string, string> = {
  full: "integral",
  reserve_deposit: "depósito de Reserve",
  balance: "saldo",
  other: "outro",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending_verification: "aguardando verificação",
  confirmed: "confirmado",
  rejected: "rejeitado",
  refunded: "reembolsado",
  chargeback: "estorno (chargeback)",
  canceled: "cancelado",
};

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
              <th className="py-2 pr-2">Produto</th>
              <th className="py-2 pr-2">Cor / Tamanho</th>
              <th className="py-2 pr-2">Qtd.</th>
              <th className="py-2 pr-2">Preço unitário ({order.currency})</th>
              <th className="py-2 pr-2 text-right">Total da linha</th>
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
        O Original Request do comprador é sempre mantido (exibido abaixo de cada linha alterada e no histórico abaixo).
        EM FALTA (SEM ESTOQUE) também torna a variante indisponível no catálogo e registra uma venda perdida. SOB ENCOMENDA /
        OUTRO MOTIVO afeta somente este pedido.
      </p>
      <p className="text-xs mt-2">
        Subtotal (mercadoria): <strong>{money(currentSubtotal, order.currency)}</strong>
        {Math.abs(currentSubtotal - originalSubtotal) > 0.004 && (
          <span className="text-muted"> · Original Request {money(originalSubtotal, order.currency)}</span>
        )}
        {" "}· Total com frete e impostos: <strong>{money(order.total, order.currency)}</strong>
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
        {item.added_by_tdp && <span className="block text-[10px] uppercase text-accent">adicionado pela TDP</span>}
        {substitutedFor && (
          <span className="block text-[10px] text-muted">substitui {substitutedFor.product_title} {substitutedFor.color}/{substitutedFor.size}</span>
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
        {qtyChanged && <span className="block text-[10px] text-muted">antes {item.original_qty}</span>}
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
        {priceChanged && <span className="block text-[10px] text-muted">antes {money(item.original_unit_price, order.currency)}</span>}
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
                Marcar em falta (sem estoque)
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
            Restaurar original
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
          const res = await addOrderItemBySku(order.id, picked.sku, qty, substitutes || undefined, price === "" ? undefined : Number(price));
          if (res && typeof res === "object" && "error" in res) return res;
          setQuery("");
          setPicked(null);
          setPrice("");
          setSubstitutes("");
          setQty(1);
        });
      }}
    >
      <p className="font-medium">Adicionar peça / substituir linha</p>
      <div className="relative">
        <input
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="Buscar por nome do produto ou SKU…"
          className="w-full border border-border px-2 py-1"
        />
        {(results.length > 0 || searching) && (
          <ul className="absolute z-10 left-0 right-0 bg-background border border-border max-h-56 overflow-auto shadow">
            {searching && <li className="px-2 py-1 text-muted">Buscando…</li>}
            {results.map((r) => (
              <li key={r.sku}>
                <button type="button" onClick={() => pick(r)} className="w-full text-left px-2 py-1 hover:bg-surface">
                  {r.title} — {r.color ?? "—"} / {r.size ?? "—"}{" "}
                  <span className="text-muted font-mono">{r.sku}</span>{" "}
                  <span className="text-muted">
                    · estoque {r.stock} · {r.price !== null ? money(r.price, order.currency) : "sem preço"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col">
          Qtd.
          <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="w-16 border border-border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          Preço unitário ({order.currency})
          <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="w-28 border border-border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          Substitui linha (opcional)
          <select value={substitutes} onChange={(e) => setSubstitutes(e.target.value)} className="border border-border px-2 py-1">
            <option value="">— nova linha —</option>
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
          Adicionar ao pedido
        </button>
      </div>
    </form>
  );
}

function OrderHistoryPanel({ order, items, events }: { order: OrderSummary; items: OrderItemRow[]; events: OrderEventRow[] }) {
  const original = items.filter((i) => i.original_qty !== null);
  return (
    <section>
      <h2 className="text-sm font-medium uppercase tracking-wide mb-2">Original Request e histórico de alterações</h2>
      <details className="mb-3 text-xs" open={false}>
        <summary className="cursor-pointer">
          Original Request — {money(order.original_subtotal, order.currency)} ({original.length} linha(s))
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
        <p className="text-xs text-muted">Nenhuma alteração registrada ainda.</p>
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
  { key: "freightAmount", column: "freight_amount", label: "Frete (DHL)" },
  { key: "fuelSurchargeAmount", column: "fuel_surcharge_amount", label: "Sobretaxa de combustível" },
  { key: "demandSurchargeAmount", column: "demand_surcharge_amount", label: "Sobretaxa de demanda" },
  { key: "otherDhlAmount", column: "other_dhl_amount", label: "Outras cobranças DHL" },
  { key: "insuranceAmount", column: "insurance_amount", label: "Seguro" },
  { key: "exportDeclarationAmount", column: "export_declaration_amount", label: "Declaração de exportação" },
  { key: "dutiesTaxesAmount", column: "duties_taxes_amount", label: "Impostos de importação (DDP)" },
  { key: "otherChargesAmount", column: "other_charges_amount", label: "Outras cobranças operacionais" },
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
        <h2 className="text-sm font-medium uppercase tracking-wide">Frete e impostos de importação ({order.currency})</h2>
        <span className={`text-[11px] px-2 py-0.5 ${order.charges_informed_at ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
          {order.charges_informed_at
            ? `Informado em ${new Date(order.charges_informed_at).toLocaleString("pt-BR")}`
            : "Não informado — o comprador vê “a informar após a confirmação de estoque”"}
        </span>
      </div>
      {pkg && (
        <p className="text-[11px] text-muted mb-2">
          Embalagem sugerida: {pkg.number_of_packages ?? "?"} volume(s)
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
          Entrega DHL (dias úteis)
          <input type="number" min="1" disabled={!editable || pending} value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} className="border border-border px-2 py-1" />
        </label>
        <label className="flex flex-col col-span-2 md:col-span-3">
          Observação (interna)
          <input disabled={!editable || pending} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ref. da cotação DHL, serviço…" className="border border-border px-2 py-1" />
        </label>
        <p className="col-span-2 md:col-span-3 self-end">
          Produtos {money(order.subtotal, order.currency)} + cobranças {money(charges, order.currency)} ={" "}
          <strong>{money(Number(order.subtotal) + charges, order.currency)}</strong>
        </p>
        {editable && (
          <button type="submit" disabled={pending} className="btn-primary px-3 py-1.5">
            Salvar frete e impostos
          </button>
        )}
      </form>
      <p className="text-[11px] text-muted mt-2">
        Obrigatório antes de gerar o Confirmed Order. Mantido separado da receita (Dashboard → cobranças operacionais).
      </p>
    </section>
  );
}

function ReleasePanel({ order, editable, pending, run }: { order: OrderSummary; editable: boolean; pending: boolean; run: Run }) {
  const [hold, setHold] = useState<"24h" | "48h" | "custom" | "cannot_reserve">("48h");
  const [customUntil, setCustomUntil] = useState("");

  return (
    <section className="border border-border p-4">
      <h2 className="text-sm font-medium uppercase tracking-wide mb-2">Confirmed Order e reserva temporária de estoque (Temporary Stock Hold)</h2>
      {order.stock_hold_type && (
        <p className="text-xs mb-2">
          Atual: <strong>{STOCK_HOLD_LABELS[order.stock_hold_type]}</strong>
          {order.stock_hold_until && <> — Estoque reservado até {new Date(order.stock_hold_until).toLocaleString("pt-BR")}</>}
        </p>
      )}
      {editable ? (
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label className="flex flex-col">
            O fornecedor consegue reservar as peças?
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
              Reservar até
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
              ? "Estoque reconfirmado — reabrir pagamento"
              : "Gerar Confirmed Order"}
          </button>
          <p className="w-full text-muted">
            A reserva começa quando o Confirmed Order é liberado. Prazos expirados desativam o pagamento e vão para o
            Action Center. Recalcule DHL/custos antes de reabrir um pedido expirado ou em coordenação.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted">Já liberado.</p>
      )}
      <div className="mt-3 text-xs flex flex-wrap items-center gap-3">
        <span>
          Modo: <strong>{order.payment_mode === "reserve" ? "Reserve for Later Delivery" : "Padrão"}</strong>
          {order.payment_mode === "reserve" && order.reserve_amount !== null && (
            <> — reserva {money(order.reserve_amount, order.currency)} ({order.reserve_pct_of_sale}% da venda)</>
          )}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setReserveMode(order.id, order.payment_mode !== "reserve"))}
          className="underline"
        >
          {order.payment_mode === "reserve" ? "Mudar para padrão" : "Usar Reserve (custo + %)"}
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
      <h2 className="text-sm font-medium uppercase tracking-wide mb-2">Formas de pagamento deste pedido</h2>
      <p className="text-[11px] text-muted mb-2">Padrão do canal → exceção do cliente → exceção do pedido (a mais específica prevalece).</p>
      <table className="text-xs">
        <tbody>
          {methods.map((m) => {
            const rule = orderRules[m.method_code];
            const value = rule === undefined ? "inherit" : rule ? "on" : "off";
            return (
              <tr key={m.method_code}>
                <td className="pr-4 py-1">{m.method_name}</td>
                <td className="pr-4 py-1">
                  <strong>{m.enabled ? "Habilitado" : "Desabilitado"}</strong> <span className="text-muted">({DECIDED_BY_LABELS[m.decided_by] ?? m.decided_by})</span>
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
                    <option value="inherit">Pedido: herdar</option>
                    <option value="on">Pedido: permitir</option>
                    <option value="off">Pedido: bloquear</option>
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
                      Habilitar Stripe para este pedido
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
  attempts,
  pending,
  run,
}: {
  attempts: PaymentAttemptRow[];
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
      <h2 className="text-sm font-medium uppercase tracking-wide mb-2">Pagamentos (uma linha por transação)</h2>
      {attempts.length > 0 && (
        <div className="mb-3 border border-red-200 bg-red-50/40 p-3 text-xs space-y-1">
          <h3 className="font-semibold uppercase tracking-wide text-red-700">Tentativas de pagamento que falharam</h3>
          {attempts.map((a) => (
            <p key={a.id}>
              {new Date(a.created_at).toLocaleString("pt-BR")} · {ATTEMPT_STATUS_LABELS[a.status] ?? a.status}
              {a.amount !== null && a.currency ? ` · ${money(a.amount, a.currency)}` : ""}
              {a.message ? ` — ${a.message}` : ""}
            </p>
          ))}
        </div>
      )}
      {payments.length === 0 ? (
        <p className="text-xs text-muted mb-3">Nenhum pagamento ainda.</p>
      ) : (
        <table className="w-full text-xs mb-4">
          <thead>
            <tr className="text-left text-muted uppercase border-b border-border">
              <th className="py-1 pr-2">Forma / tipo</th>
              <th className="py-1 pr-2">Mercadoria</th>
              <th className="py-1 pr-2">Taxa bancária</th>
              <th className="py-1 pr-2">Total</th>
              <th className="py-1 pr-2">Status</th>
              <th className="py-1">Ações</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-border">
                <td className="py-1 pr-2">
                  {PAYMENT_METHOD_LABELS[p.method_code] ?? p.method_code} · {PAYMENT_KIND_LABELS[p.kind] ?? p.kind}
                  {p.proof_path && <PaymentProofLink orderId={order.id} paymentId={p.id} name={p.proof_name ?? null} />}
                </td>
                <td className="py-1 pr-2">{money(p.merchandise_amount, p.currency)}</td>
                <td className="py-1 pr-2">{money(p.bank_fee_amount, p.currency)}</td>
                <td className="py-1 pr-2">
                  {money(p.amount, p.currency)}
                  {p.received_amount !== null && Number(p.received_amount) !== Number(p.amount) && (
                    <span className="block text-red-600">recebido {money(p.received_amount, p.currency)}</span>
                  )}
                </td>
                <td className="py-1 pr-2 uppercase">{PAYMENT_STATUS_LABELS[p.status] ?? p.status.replace(/_/g, " ")}</td>
                <td className="py-1 space-x-2">
                  {p.status === "pending_verification" && (
                    <>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="recebido"
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
                        Confirmar
                      </button>
                      <button type="button" disabled={pending} onClick={() => run(() => setPaymentStatus(order.id, p.id, "rejected"))} className="underline">
                        Rejeitar
                      </button>
                    </>
                  )}
                  {p.status === "confirmed" && (
                    <>
                      <button type="button" disabled={pending} onClick={() => run(() => setPaymentStatus(order.id, p.id, "refunded"))} className="underline">
                        Reembolsado
                      </button>
                      <button type="button" disabled={pending} onClick={() => run(() => setPaymentStatus(order.id, p.id, "chargeback"))} className="underline">
                        Estorno (chargeback)
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
          Forma de pagamento
          <select value={form.methodCode} onChange={(e) => setForm((f) => ({ ...f, methodCode: e.target.value }))} className="border border-border px-1 py-1">
            {methods.map((m) => (
              <option key={m.method_code} value={m.method_code}>
                {m.method_name}
                {m.enabled ? "" : " (não habilitada para o comprador)"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          Tipo
          <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as PaymentInput["kind"] }))} className="border border-border px-1 py-1">
            <option value="full">Integral</option>
            <option value="reserve_deposit">Depósito de Reserve</option>
            <option value="balance">Saldo</option>
            <option value="other">Outro</option>
          </select>
        </label>
        <label className="flex flex-col">
          Mercadoria ({order.currency})
          <input type="number" step="0.01" value={form.merchandiseAmount ?? ""} onChange={setNum("merchandiseAmount")} className="border border-border px-1 py-1" />
        </label>
        {PASS_THROUGH_COMPONENTS.filter((c) => c.key !== "bank_fee_amount").map((c) => (
          <label key={c.key} className="flex flex-col">
            {c.label.replace(/ recebid[oa]s?/, "")}
            <input type="number" step="0.01" value={(form[camel[c.key]] as number | undefined) ?? ""} onChange={setNum(camel[c.key])} className="border border-border px-1 py-1" />
          </label>
        ))}
        <p className="col-span-2 md:col-span-4 text-muted">
          Bank Transfer (transferência bancária) adiciona uma taxa bancária por transferência (R$ {bankFeeBrl.toFixed(2)} convertidos para {order.currency}).
        </p>
        <div className="col-span-2 md:col-span-4 flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending || enabled.length === 0} className="border border-border px-3 py-1.5">
            Registrar pagamento (a verificar)
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => registerPayment(order.id, { ...form, confirmNow: true }))}
            className="btn-primary px-3 py-1.5"
          >
            Pagamento recebido — marcar como pago
          </button>
          <span className="text-muted">
            “Marcar como pago” registra o valor como confirmado agora (qualquer forma) e define o pedido como PAGO quando a
            mercadoria estiver totalmente coberta.
          </span>
        </div>
      </form>
    </section>
  );
}
