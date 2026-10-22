/**
 * DHL Express (MyDHL API) adapter — the integration seam for shipments.
 *
 * REAL mode needs all of:
 *   DHL_API_KEY, DHL_API_SECRET, DHL_ACCOUNT_NUMBER
 *   optional: DHL_API_BASE_URL (default https://express.api.dhl.com/mydhlapi;
 *             use https://express.api.dhl.com/mydhlapi/test for the sandbox),
 *             DHL_PRODUCT_CODE (default "P" = EXPRESS WORLDWIDE)
 * Without them the MOCK implementation runs: it fabricates a tracking code
 * that is CLEARLY prefixed "MOCK-" and every record created from it is
 * flagged is_mock (Admin shows "MOCK", buyers are never e-mailed it).
 *
 * The real calls follow the public MyDHL API 2.x contract (POST /shipments,
 * POST /pickups, GET /tracking) but have NOT been exercised against DHL
 * from this environment (no credentials) — validate in the sandbox first.
 */

export interface DhlParty {
  companyName: string;
  fullName: string;
  email?: string;
  phone?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode: string;
  countryCode: string;
}

export interface DhlPackage {
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface DhlShipmentRequest {
  reference: string;
  shipper: DhlParty;
  receiver: DhlParty;
  packages: DhlPackage[];
  declaredValue: number;
  currency: string;
  description: string;
  incoterm: string;
  plannedShippingDate: string; // YYYY-MM-DD
}

export interface DhlDocument {
  kind: "label" | "commercial_invoice" | "packing_list" | "other";
  fileName: string;
  contentType: string;
  base64: string;
}

export interface DhlShipmentResult {
  isMock: boolean;
  trackingNumber: string;
  trackingUrl: string | null;
  documents: DhlDocument[];
  raw: unknown;
}

export interface DhlTrackingEvent {
  status: string;
  description: string;
  location: string | null;
  occurredAt: string;
}

export interface DhlTrackingResult {
  isMock: boolean;
  /** Mapped to our shipment statuses when DHL reports a definitive state. */
  status: "PICKUP_REQUESTED" | "IN_TRANSIT" | "DELIVERED" | "EXCEPTION" | null;
  events: DhlTrackingEvent[];
}

export function dhlConfigured(): boolean {
  return Boolean(process.env.DHL_API_KEY && process.env.DHL_API_SECRET && process.env.DHL_ACCOUNT_NUMBER);
}

export function dhlMode(): "real" | "mock" {
  return dhlConfigured() ? "real" : "mock";
}

function baseUrl() {
  return (process.env.DHL_API_BASE_URL || "https://express.api.dhl.com/mydhlapi").replace(/\/$/, "");
}

function authHeader() {
  return `Basic ${Buffer.from(`${process.env.DHL_API_KEY}:${process.env.DHL_API_SECRET}`).toString("base64")}`;
}

export function trackingUrlFor(trackingNumber: string): string {
  return `https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(trackingNumber)}`;
}

async function dhlFetch(path: string, init: RequestInit & { json?: unknown } = {}) {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const detail = typeof body === "object" && body ? ((body as { detail?: string; message?: string }).detail ?? (body as { message?: string }).message) : String(body);
    throw new Error(`DHL ${res.status}: ${String(detail ?? "erro").slice(0, 300)}`);
  }
  return body as Record<string, unknown>;
}

function party(p: DhlParty) {
  return {
    postalAddress: {
      postalCode: p.postalCode,
      cityName: p.city,
      countryCode: p.countryCode,
      provinceCode: p.state || undefined,
      addressLine1: p.addressLine1.slice(0, 45),
      addressLine2: p.addressLine2?.slice(0, 45) || undefined,
    },
    contactInformation: {
      email: p.email || undefined,
      phone: p.phone || "0000000000",
      companyName: (p.companyName || p.fullName).slice(0, 60),
      fullName: p.fullName.slice(0, 45),
    },
  };
}

export async function createShipment(req: DhlShipmentRequest): Promise<DhlShipmentResult> {
  if (!dhlConfigured()) {
    const digits = String(Math.floor(Math.random() * 1e10)).padStart(10, "0");
    return {
      isMock: true,
      trackingNumber: `MOCK-${digits}`,
      trackingUrl: null,
      documents: [],
      raw: { mock: true, reference: req.reference },
    };
  }

  const body = {
    plannedShippingDateAndTime: `${req.plannedShippingDate}T12:00:00GMT+00:00`,
    pickup: { isRequested: false },
    productCode: process.env.DHL_PRODUCT_CODE || "P",
    accounts: [{ typeCode: "shipper", number: process.env.DHL_ACCOUNT_NUMBER }],
    customerReferences: [{ typeCode: "CU", value: req.reference.slice(0, 35) }],
    customerDetails: { shipperDetails: party(req.shipper), receiverDetails: party(req.receiver) },
    content: {
      packages: req.packages.map((p) => ({
        weight: Math.max(0.1, Math.round(p.weightKg * 1000) / 1000),
        dimensions: { length: Math.ceil(p.lengthCm), width: Math.ceil(p.widthCm), height: Math.ceil(p.heightCm) },
      })),
      isCustomsDeclarable: true,
      declaredValue: req.declaredValue,
      declaredValueCurrency: req.currency,
      unitOfMeasurement: "metric",
      description: req.description.slice(0, 70),
      incoterm: req.incoterm || "DAP",
    },
    outputImageProperties: {
      encodingFormat: "pdf",
      imageOptions: [{ typeCode: "label" }, { typeCode: "waybillDoc" }],
    },
  };
  const json = await dhlFetch("/shipments", { method: "POST", json: body });
  const trackingNumber = String(json.shipmentTrackingNumber ?? "");
  if (!trackingNumber) throw new Error("DHL não retornou o número de rastreio.");
  const docs = ((json.documents as { typeCode?: string; content?: string; imageFormat?: string }[]) ?? [])
    .filter((d) => d.content)
    .map<DhlDocument>((d) => ({
      kind: d.typeCode === "label" ? "label" : d.typeCode === "invoice" ? "commercial_invoice" : "other",
      fileName: `${d.typeCode ?? "doc"}-${trackingNumber}.${(d.imageFormat ?? "PDF").toLowerCase()}`,
      contentType: "application/pdf",
      base64: String(d.content),
    }));
  return { isMock: false, trackingNumber, trackingUrl: trackingUrlFor(trackingNumber), documents: docs, raw: json };
}

export interface PickupRequest {
  trackingNumber: string;
  pickupDate: string; // YYYY-MM-DD
  readyByTime: string; // HH:MM
  closeTime: string; // HH:MM
  shipper: DhlParty;
  packagesCount: number;
  totalWeightKg: number;
  remarks?: string;
}

export async function requestPickup(req: PickupRequest): Promise<{ isMock: boolean; confirmation: string; raw: unknown }> {
  if (!dhlConfigured()) {
    return { isMock: true, confirmation: `MOCK-PICKUP-${Date.now().toString().slice(-8)}`, raw: { mock: true } };
  }
  const body = {
    plannedPickupDateAndTime: `${req.pickupDate}T${req.readyByTime}:00GMT+00:00`,
    closeTime: req.closeTime,
    location: "reception",
    accounts: [{ typeCode: "shipper", number: process.env.DHL_ACCOUNT_NUMBER }],
    customerDetails: { shipperDetails: party(req.shipper) },
    shipmentDetails: [
      {
        productCode: process.env.DHL_PRODUCT_CODE || "P",
        isCustomsDeclarable: true,
        unitOfMeasurement: "metric",
        packages: [{ weight: Math.max(0.1, req.totalWeightKg / Math.max(1, req.packagesCount)) }],
      },
    ],
    remark: req.remarks?.slice(0, 80),
  };
  const json = await dhlFetch("/pickups", { method: "POST", json: body });
  const ids = (json.dispatchConfirmationNumbers as string[] | undefined) ?? [];
  if (ids.length === 0) throw new Error("DHL não retornou a confirmação da coleta.");
  return { isMock: false, confirmation: ids[0], raw: json };
}

export async function getTracking(trackingNumber: string): Promise<DhlTrackingResult> {
  if (!dhlConfigured() || trackingNumber.startsWith("MOCK-")) {
    return { isMock: true, status: null, events: [] };
  }
  const json = await dhlFetch(`/tracking?shipmentTrackingNumber=${encodeURIComponent(trackingNumber)}&trackingView=all-checkpoints&levelOfDetail=all`);
  const shipment = (json.shipments as { events?: { date?: string; time?: string; typeCode?: string; description?: string; serviceArea?: { description?: string }[] }[] }[] | undefined)?.[0];
  const events: DhlTrackingEvent[] = (shipment?.events ?? []).map((e) => ({
    status: e.typeCode ?? "",
    description: e.description ?? "",
    location: e.serviceArea?.[0]?.description ?? null,
    occurredAt: new Date(`${e.date ?? ""}T${e.time ?? "00:00:00"}`).toISOString(),
  }));
  // DHL event type codes: PU picked up, OK delivered, RT/ HO/ MS … exceptions
  const codes = new Set(events.map((e) => e.status));
  let status: DhlTrackingResult["status"] = null;
  if (codes.has("OK")) status = "DELIVERED";
  else if (["MS", "HO", "RT", "UD", "CA"].some((c) => codes.has(c))) status = "EXCEPTION";
  else if (codes.has("PU")) status = "IN_TRANSIT";
  return { isMock: false, status, events };
}
