"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createShipmentAction,
  deleteShipmentDocument,
  getShipmentDocumentUrl,
  refreshTrackingAction,
  requestPickupAction,
  setShipmentStatusAction,
  uploadShipmentDocument,
  type ActionResult,
  type ShipmentStatus,
} from "@/app/admin/pedidos/[id]/shipping-actions";

export interface ShipmentView {
  id: string;
  status: ShipmentStatus;
  dhl_tracking: string | null;
  tracking_url: string | null;
  is_mock: boolean;
  pickup_date: string | null;
  pickup_reference: string | null;
  last_error: string | null;
}
export interface ShipmentEventView {
  id: string;
  status: string;
  description: string | null;
  location: string | null;
  occurred_at: string;
  source: string;
}
export interface ShipmentDocView {
  id: string;
  kind: string;
  file_name: string;
  created_at: string;
  visible_to_buyer: boolean;
}
export interface PackageDraft {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
}

const STATUS_LABELS: Record<string, string> = {
  CREATED: "CRIADO",
  PICKUP_REQUESTED: "COLETA SOLICITADA",
  IN_TRANSIT: "EM TRÂNSITO",
  DELIVERED: "ENTREGUE",
  EXCEPTION: "EXCEÇÃO",
};
const KIND_LABELS: Record<string, string> = {
  commercial_invoice: "Commercial invoice",
  packing_list: "Packing list",
  label: "Etiqueta (label)",
  other: "Outro",
};

export function ShipmentWorkflowPanel({
  orderId,
  orderPaid,
  mode,
  shipment,
  events,
  documents,
  initialPackages,
}: {
  orderId: string;
  orderPaid: boolean;
  mode: "real" | "mock";
  shipment: ShipmentView | null;
  events: ShipmentEventView[];
  documents: ShipmentDocView[];
  initialPackages: PackageDraft[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [packages, setPackages] = useState<PackageDraft[]>(initialPackages);
  const [plannedDate, setPlannedDate] = useState(today);
  const [pickupDate, setPickupDate] = useState(today);
  const [readyBy, setReadyBy] = useState("13:00");
  const [closeTime, setCloseTime] = useState("17:00");
  const [newStatus, setNewStatus] = useState<ShipmentStatus>("IN_TRANSIT");
  const [note, setNote] = useState("");
  const [location, setLocation] = useState("");
  const [docKind, setDocKind] = useState("commercial_invoice");

  function run(fn: () => Promise<ActionResult>) {
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      setMessage({ error: Boolean(result.error), text: result.error ?? result.info ?? "OK" });
      if (!result.error) router.refresh();
    });
  }

  function openDoc(id: string) {
    startTransition(async () => {
      const result = await getShipmentDocumentUrl(id);
      if (result.url) window.open(result.url, "_blank", "noopener");
      else setMessage({ error: true, text: result.error ?? "Falha ao abrir." });
    });
  }

  function setPkg(i: number, field: keyof PackageDraft, value: string) {
    setPackages((prev) => prev.map((p, idx) => (idx === i ? { ...p, [field]: Number(value) } : p)));
  }

  return (
    <section className="border border-border p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-wider font-semibold">Envio DHL</h2>
        <span className={`text-[10px] font-semibold px-2 py-0.5 border ${mode === "mock" ? "border-foreground" : "border-border"}`}>
          {mode === "mock" ? "MODO MOCK — sem credenciais DHL (DHL_API_KEY / DHL_API_SECRET / DHL_ACCOUNT_NUMBER)" : "DHL Express (MyDHL API)"}
        </span>
      </div>

      {!shipment ? (
        !orderPaid ? (
          <p className="text-sm text-muted">O envio só pode ser criado depois do pagamento integral do pedido.</p>
        ) : (
          <div className="space-y-3 text-xs">
            <p className="text-muted">Confira os volumes (sugestão automática de embalagens) e crie o envio.</p>
            <div className="space-y-2">
              {packages.map((p, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <span className="w-16 text-muted">Volume {i + 1}</span>
                  {(["lengthCm", "widthCm", "heightCm", "weightKg"] as const).map((f) => (
                    <label key={f} className="flex items-center gap-1">
                      <span className="text-muted">{{ lengthCm: "C", widthCm: "L", heightCm: "A", weightKg: "kg" }[f]}</span>
                      <input value={p[f]} onChange={(e) => setPkg(i, f, e.target.value)} className="w-16 border border-border px-1.5 py-1" inputMode="decimal" />
                    </label>
                  ))}
                  {packages.length > 1 && (
                    <button type="button" className="text-muted underline" onClick={() => setPackages((prev) => prev.filter((_, idx) => idx !== i))}>
                      remover
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="underline text-muted" onClick={() => setPackages((prev) => [...prev, { lengthCm: 40, widthCm: 30, heightCm: 20, weightKg: 2 }])}>
                + volume
              </button>
            </div>
            <label className="flex items-center gap-2">
              Data prevista de envio
              <input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} className="border border-border px-2 py-1" />
            </label>
            <button type="button" disabled={pending} onClick={() => run(() => createShipmentAction({ orderId, plannedDate, packages }))} className="bg-foreground text-background px-4 py-2 disabled:opacity-40">
              Criar envio {mode === "mock" ? "(MOCK)" : "na DHL"}
            </button>
          </div>
        )
      ) : (
        <div className="space-y-4 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold border border-foreground px-2 py-0.5">{STATUS_LABELS[shipment.status]}</span>
            <span className="font-mono">{shipment.dhl_tracking}</span>
            {shipment.is_mock && <span className="border border-foreground px-1.5 py-0.5 font-semibold">MOCK — código fictício, não rastreável</span>}
            {shipment.tracking_url && (
              <a href={shipment.tracking_url} target="_blank" rel="noopener noreferrer" className="underline">
                rastrear na DHL
              </a>
            )}
          </div>
          {shipment.last_error && <p className="text-red-700">Último erro: {shipment.last_error}</p>}
          {shipment.pickup_reference && (
            <p className="text-muted">
              Coleta {shipment.pickup_date} · confirmação {shipment.pickup_reference}
            </p>
          )}

          {shipment.status === "CREATED" && (
            <div className="flex flex-wrap items-end gap-2 border border-border p-3">
              <label className="space-y-1">
                <span className="block text-muted">Data da coleta</span>
                <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className="border border-border px-2 py-1" />
              </label>
              <label className="space-y-1">
                <span className="block text-muted">Pronto às</span>
                <input type="time" value={readyBy} onChange={(e) => setReadyBy(e.target.value)} className="border border-border px-2 py-1" />
              </label>
              <label className="space-y-1">
                <span className="block text-muted">Fecha às</span>
                <input type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} className="border border-border px-2 py-1" />
              </label>
              <button type="button" disabled={pending} onClick={() => run(() => requestPickupAction(shipment.id, pickupDate, readyBy, closeTime))} className="bg-foreground text-background px-3 py-1.5 disabled:opacity-40">
                Solicitar coleta
              </button>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="uppercase tracking-wider text-muted">Linha do tempo</h3>
            {events.length === 0 ? (
              <p className="text-muted">Sem eventos.</p>
            ) : (
              <ul className="space-y-1">
                {events.map((e) => (
                  <li key={e.id}>
                    <span className="text-muted">{new Date(e.occurred_at).toLocaleString("pt-BR")}</span> · <strong>{STATUS_LABELS[e.status] ?? e.status}</strong>
                    {e.description ? ` — ${e.description}` : ""}
                    {e.location ? ` (${e.location})` : ""}
                    <span className="text-muted"> [{e.source}]</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as ShipmentStatus)} className="border border-border px-2 py-1">
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação" className="border border-border px-2 py-1 w-48" />
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Local" className="border border-border px-2 py-1 w-32" />
              <button type="button" disabled={pending} onClick={() => run(() => setShipmentStatusAction(shipment.id, newStatus, note, location))} className="border border-foreground px-3 py-1.5 disabled:opacity-40">
                Atualizar status
              </button>
              {!shipment.is_mock && (
                <button type="button" disabled={pending} onClick={() => run(() => refreshTrackingAction(shipment.id))} className="border border-border px-3 py-1.5 disabled:opacity-40">
                  Buscar rastreio DHL
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="uppercase tracking-wider text-muted">Documentos (bucket privado)</h3>
            {documents.length === 0 ? (
              <p className="text-muted">Nenhum documento.</p>
            ) : (
              <ul className="space-y-1">
                {documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{KIND_LABELS[d.kind] ?? d.kind}</span>
                    <button type="button" className="underline" onClick={() => openDoc(d.id)}>
                      {d.file_name}
                    </button>
                    {d.visible_to_buyer && <span className="text-muted">(visível ao comprador)</span>}
                    <button type="button" className="text-muted underline" onClick={() => run(() => deleteShipmentDocument(d.id))}>
                      remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              action={(fd) => run(() => uploadShipmentDocument(fd))}
              className="flex flex-wrap items-end gap-2"
            >
              <input type="hidden" name="shipmentId" value={shipment.id} />
              <select name="kind" value={docKind} onChange={(e) => setDocKind(e.target.value)} className="border border-border px-2 py-1">
                {Object.entries(KIND_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input type="file" name="file" className="text-xs" />
              {docKind === "commercial_invoice" && (
                <label className="flex items-center gap-1">
                  <input type="checkbox" name="visible" /> visível ao comprador
                </label>
              )}
              <button disabled={pending} className="border border-foreground px-3 py-1.5 disabled:opacity-40">
                Enviar arquivo
              </button>
            </form>
          </div>
        </div>
      )}
      {message && <p className={`text-xs ${message.error ? "text-red-700" : ""}`}>{message.text}</p>}
    </section>
  );
}
