import { getColorResolver } from "@/lib/colors";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { PdfDocument, wrapText, type PdfImage } from "@/lib/pdf-writer";
import { countryName } from "@/lib/countries";
import { matchSize, type SizeChartRow } from "@/lib/size-format";
import { INVOICE_LOGO } from "@/lib/invoice-logo";

/**
 * Commercial invoice: data snapshot → PDF → private bucket `shipment-docs`.
 * Company data, bank details and notes come from app_settings
 * 'invoice_template' (Admin → Configurações da invoice) because the
 * client's final template is still pending. Numbering: INV-<year>-<seq>,
 * one sequence per year (next_invoice_number(), migration 0074).
 */

export const INVOICE_BUCKET = "shipment-docs";

export interface InvoiceTemplate {
  number_prefix: string;
  company_name: string;
  /** sender contact person (invoice header) */
  contact_name: string;
  building_name: string;
  company_address: string;
  company_city: string;
  company_postal_code: string;
  company_country_code: string;
  company_tax_id: string;
  company_email: string;
  company_phone: string;
  bank_details: string;
  notes: string;
  footer: string;
  origin_country: string;
  /** signature block of the invoice */
  signer_name: string;
  signer_email: string;
  signer_title: string;
  /** packaging allowance added to each piece's net weight to get the gross weight (kg) */
  gross_extra_kg: string;
}

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplate = {
  number_prefix: "INV",
  company_name: "The Dressing Project",
  contact_name: "",
  building_name: "",
  company_address: "",
  company_city: "",
  company_postal_code: "",
  company_country_code: "BR",
  company_tax_id: "",
  company_email: "",
  company_phone: "",
  bank_details: "",
  notes: "",
  footer: "",
  origin_country: "Brazil",
  signer_name: "",
  signer_email: "",
  signer_title: "",
  gross_extra_kg: "0.1",
};

export interface InvoiceLine {
  /** TDP reference shown to the buyer (TDP2122) */
  ref: string;
  /** product name in English */
  description: string;
  color: string;
  /** size letter (S, M, L…) */
  size: string;
  sku: string;
  /** customs description (English), shown under the line when the product has one */
  customs?: string;
  /** commodity code formatted "62 04 43 00" (8-digit NCM) or "62 04 43" (6-digit HS) */
  hsCode: string;
  origin: string;
  qty: number;
  unitPrice: number;
  amount: number;
  /** per piece, kg (null = not registered) */
  netKg: number | null;
  grossKg: number | null;
}

export interface InvoiceParty {
  company: string;
  contact: string;
  building: string;
  street: string;
  postcode: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  taxId: string;
}

export interface InvoiceData {
  number: string;
  issuedAt: string;
  orderNumber: string;
  currency: string;
  incoterm: string;
  template: InvoiceTemplate;
  sender: InvoiceParty;
  receiver: InvoiceParty;
  lines: InvoiceLine[];
  /** every charge of the order, itemised (kept in the snapshot) */
  charges: { label: string; amount: number }[];
  /** the three cost lines of the invoice model */
  costs: { insurance: number; freight: number; other: number };
  merchandise: number;
  total: number;
  totalNetKg: number;
  totalGrossKg: number;
  trackingNumber: string | null;
}

export async function getInvoiceTemplate(): Promise<InvoiceTemplate> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "invoice_template").maybeSingle();
  return { ...DEFAULT_INVOICE_TEMPLATE, ...((data?.value ?? {}) as Partial<InvoiceTemplate>) };
}

const CHARGE_LABELS: [string, string][] = [
  ["freight_amount", "International freight"],
  ["insurance_amount", "Insurance"],
  ["fuel_surcharge_amount", "Fuel surcharge"],
  ["demand_surcharge_amount", "Demand surcharge"],
  ["export_declaration_amount", "Export declaration"],
  ["other_dhl_amount", "Other carrier charges"],
  ["duties_taxes_amount", "Duties & taxes"],
  ["other_charges_amount", "Other charges"],
];

/** HS code at 6 digits (the international level); an 8-digit Brazilian NCM is cut to its first 6. */
export function hs6(code: string | null | undefined): string {
  const digits = (code ?? "").replace(/\D/g, "");
  return digits.length >= 6 ? digits.slice(0, 6) : "";
}

/** Commodity code as the invoice model prints it: "62 04 43 00" (full 8-digit NCM preferred) or "62 04 43". */
export function formatCommodityCode(ncm: string | null | undefined, hs: string | null | undefined): string {
  const n = (ncm ?? "").replace(/\D/g, "");
  const digits = n.length >= 8 ? n.slice(0, 8) : hs6(hs) || (n.length >= 6 ? n.slice(0, 6) : "");
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ");
}

const round2 = (n: number) => Math.round(n * 100) / 100;

async function buildInvoiceData(orderId: string, number: string, issuedAt: string): Promise<InvoiceData> {
  const supabase = createServiceRoleClient();
  const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) throw new Error("Pedido não encontrado.");
  const [{ data: items }, { data: customer }, { data: shipment }, template, { data: chartRows }] = await Promise.all([
    supabase.from("order_items").select("qty, unit_price, item_status, product_title, sku, color, size, product_id").eq("order_id", orderId).order("id"),
    supabase.from("customers").select("name, company_name, tax_id, phone, email").eq("id", order.customer_id).maybeSingle(),
    supabase.from("shipments").select("dhl_tracking, is_mock").eq("order_id", orderId).limit(1).maybeSingle(),
    getInvoiceTemplate(),
    supabase.from("size_chart").select("*"),
  ]);
  const chart = (chartRows ?? []) as SizeChartRow[];

  const active = (items ?? []).filter((i) => i.item_status === "available" || i.item_status === "requested");
  const productIds = [...new Set(active.map((i) => i.product_id).filter(Boolean))] as string[];
  type ProductInfo = { hs: string; title: string; customs: string; ref: string; origin: string; weightKg: number | null };
  const info = new Map<string, ProductInfo>();
  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from("products")
      .select("id, hs_code, ncm, title_en, customs_description, tdp_ref, origin_country, weight_g")
      .in("id", productIds);
    for (const p of products ?? []) {
      info.set(p.id, {
        hs: formatCommodityCode(p.ncm, p.hs_code),
        title: p.title_en ?? "",
        customs: p.customs_description ?? "",
        ref: p.tdp_ref ?? "",
        origin: p.origin_country ? countryName(p.origin_country, "en") : "",
        weightKg: p.weight_g ? Number(p.weight_g) / 1000 : null,
      });
    }
  }
  // The invoice is ALWAYS in English: product name and color, whatever the buyer's language.
  const colorsEn = await getColorResolver("en");
  const extraKg = Number(String(template.gross_extra_kg).replace(",", "."));
  const grossExtra = Number.isFinite(extraKg) && extraKg >= 0 ? extraKg : 0;

  const lines: InvoiceLine[] = active.map((i) => {
    const p = i.product_id ? info.get(i.product_id) : undefined;
    const qty = Number(i.qty);
    const sizeRow = i.size ? matchSize(chart, i.size) : null;
    return {
      ref: p?.ref ?? "",
      description: (p?.title || i.product_title || "Item").toUpperCase(),
      color: i.color ? colorsEn.label(i.color).toUpperCase() : "",
      size: (sizeRow?.letter || i.size || "").toString().toUpperCase(),
      sku: "", // internal variant codes never go on the commercial invoice
      customs: p?.customs || undefined,
      hsCode: p?.hs ?? "",
      origin: p?.origin || template.origin_country,
      qty,
      unitPrice: Number(i.unit_price),
      amount: round2(qty * Number(i.unit_price)),
      netKg: p?.weightKg ?? null,
      grossKg: p?.weightKg != null ? round2(p.weightKg + grossExtra) : null,
    };
  });
  const merchandise = round2(lines.reduce((s, l) => s + l.amount, 0));
  const amountOf = (key: string) => Number(order[key] ?? 0);
  const charges = CHARGE_LABELS.map(([key, label]) => ({ label, amount: amountOf(key) })).filter((c) => c.amount > 0);
  // the model has three cost lines: insurance, freight (carrier charges) and everything else
  const costs = {
    insurance: round2(amountOf("insurance_amount")),
    freight: round2(amountOf("freight_amount") + amountOf("fuel_surcharge_amount") + amountOf("demand_surcharge_amount") + amountOf("other_dhl_amount")),
    other: round2(amountOf("export_declaration_amount") + amountOf("duties_taxes_amount") + amountOf("other_charges_amount")),
  };
  const total = round2(merchandise + costs.insurance + costs.freight + costs.other);
  const totalNetKg = round2(lines.reduce((s, l) => s + (l.netKg ?? 0) * l.qty, 0));
  const totalGrossKg = round2(lines.reduce((s, l) => s + (l.grossKg ?? 0) * l.qty, 0));

  const addr = (order.shipping_address ?? {}) as Record<string, string>;
  const cityLine = [addr.city, addr.state].filter(Boolean).join(", ");
  const code = (addr.countryCode || addr.country || "").toString();
  const receiver: InvoiceParty = {
    company: customer?.company_name || addr.company || "",
    contact: addr.name || customer?.name || "",
    building: addr.line2 || "",
    street: addr.address || addr.line1 || "",
    postcode: addr.postalCode || addr.postal_code || "",
    city: cityLine,
    country: code.length === 2 ? countryName(code, "en") : code,
    phone: addr.phone || customer?.phone || "",
    email: addr.email || customer?.email || "",
    taxId: customer?.tax_id || "",
  };
  const tcode = template.company_country_code;
  const sender: InvoiceParty = {
    company: template.company_name,
    contact: template.contact_name,
    building: template.building_name,
    street: template.company_address,
    postcode: template.company_postal_code,
    city: template.company_city,
    country: tcode.length === 2 ? countryName(tcode, "en") : tcode,
    phone: template.company_phone,
    email: template.company_email,
    taxId: template.company_tax_id,
  };

  return {
    number,
    issuedAt,
    orderNumber: order.order_number ?? order.id.slice(0, 8),
    currency: order.currency,
    incoterm: order.incoterm || "DAP",
    template,
    sender,
    receiver,
    lines,
    charges,
    costs,
    merchandise,
    total,
    totalNetKg,
    totalGrossKg,
    trackingNumber: shipment && !shipment.is_mock ? shipment.dhl_tracking : null,
  };
}

// ---------------------------------------------------------------- PDF (client's invoice model)

const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", BRL: "R$" };

/** "2.260,00" — the number format of the client's model. */
function num(n: number): string {
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}
const kg = (n: number | null) => (n === null ? "-" : `${n.toFixed(1).replace(".", ",")} kg`);

let logo: PdfImage | null = null;
function logoImage(): PdfImage {
  if (!logo) logo = { jpeg: new Uint8Array(Buffer.from(INVOICE_LOGO.base64, "base64")), width: INVOICE_LOGO.width, height: INVOICE_LOGO.height };
  return logo;
}

export function renderInvoicePdf(d: InvoiceData): Uint8Array {
  const doc = new PdfDocument({ landscape: true });
  const W = doc.pageWidth;
  const H = doc.pageHeight;
  const L = 40;
  const R = W - 40;
  const BOTTOM = H - 36;
  const symbol = SYMBOL[d.currency] ?? d.currency;
  const GRID = 0.55;

  // ---- logo + title bar
  const logoH = 42;
  doc.image(L, 24, (logoH * INVOICE_LOGO.width) / INVOICE_LOGO.height, logoH, logoImage());
  let y = 74;
  const day = new Date(d.issuedAt);
  const isoDate = day.toISOString().slice(0, 10);
  doc.rect(L, y, R - L, 15, 0.5);
  doc.text(
    (L + R) / 2,
    y + 10.5,
    `COMMERCIAL INVOICE  -  NUMBER:${d.number}  -  WAYBILL NUMBER: ${d.trackingNumber || "-"}  -  DATE: ${isoDate}`,
    { size: 9, bold: true, align: "center", gray: 1 }
  );
  y += 15;

  // ---- sender / receiver
  const half = (R - L) / 2;
  const partyRows = (p: InvoiceParty, phoneLabel: string): [string, string][] => [
    ["Company Name:", p.company],
    ["Contact Name:", p.contact],
    ["Building Name:", p.building],
    ["Street Name & Number:", p.street],
    ["Postcode:", p.postcode],
    ["City:", p.city],
    ["Country:", p.country],
    [phoneLabel, p.phone],
    ["Email:", p.email],
    ["Tax ID/VAT No.:", p.taxId],
  ];
  const rowH = 10.4;
  const boxH = 7 + 10 * rowH;
  for (const [i, title, party, phoneLabel] of [
    [0, "SENDER", d.sender, "Phone:"],
    [1, "RECEIVER", d.receiver, "Phone Nr.:"],
  ] as [number, string, InvoiceParty, string][]) {
    const x = L + i * half;
    doc.rect(x, y, half, 13, 0.85, 0.3);
    doc.text(x + 3, y + 9.5, title, { size: 8, bold: true });
    doc.rect(x, y + 13, half, boxH, undefined, 0.3);
    partyRows(party, phoneLabel).forEach(([label, value], r) => {
      const ty = y + 13 + 9.5 + r * rowH;
      doc.text(x + 5, ty, label, { size: 7 });
      doc.text(x + 108, ty, value || "", { size: 7.5 });
    });
  }
  y += 13 + boxH + 9;

  // ---- goods table
  const widths = [80, 190, 55, 35, 70, 62, 50, 62, 62, 48, 48];
  const scale = (R - L) / widths.reduce((a, b) => a + b, 0);
  const xs: number[] = [];
  let acc = L;
  for (const w of widths) {
    xs.push(acc);
    acc += w * scale;
  }
  xs.push(R);
  const cw = (i: number) => xs[i + 1] - xs[i];
  const HEAD_H = 26;
  const heads: string[][] = [
    ["Reference Number"],
    ["Full Description of Goods"],
    ["Color"],
    ["Size"],
    ["Commodity Code", "(Full Import HS", "Code preferred)"],
    ["Country of Origin"],
    ["Quantity"],
    ["Unit Value", `(${d.currency})`],
    ["Sub-Total Value", `& (${d.currency})`],
    ["Net Weight"],
    ["Gross Weight"],
  ];
  const tableHeader = () => {
    heads.forEach((lines, i) => {
      doc.rect(xs[i], y, cw(i), HEAD_H, 0.85, GRID);
      const size = lines.length > 2 ? 5.8 : 6.8;
      const lh = size + 1.4;
      const top = y + (HEAD_H - lines.length * lh) / 2 + size - 0.6;
      lines.forEach((t, k) => doc.text(xs[i] + cw(i) / 2, top + k * lh, t, { size, bold: k === 0, align: "center" }));
    });
    y += HEAD_H;
  };
  tableHeader();
  for (const line of d.lines) {
    const desc = wrapText(line.description, 7.5, cw(1) - 8);
    const customs = line.customs ? wrapText(line.customs, 6.5, cw(1) - 8) : [];
    const rh = Math.max(11.5, desc.length * 9 + customs.length * 8 + 2.5);
    if (y + rh > BOTTOM) {
      doc.addPage();
      y = 40;
      tableHeader();
    }
    for (let i = 0; i < 11; i++) doc.rect(xs[i], y, cw(i), rh, undefined, GRID);
    const mid = y + 8.6;
    doc.text(xs[0] + cw(0) / 2, mid, line.ref || "-", { size: 7.5, bold: true, align: "center" });
    desc.forEach((part, k) => doc.text(xs[1] + cw(1) / 2, mid + k * 9, part, { size: 7.5, align: "center" }));
    customs.forEach((part, k) => doc.text(xs[1] + cw(1) / 2, mid + desc.length * 9 + k * 8, part, { size: 6.5, gray: 0.4, align: "center" }));
    doc.text(xs[2] + cw(2) / 2, mid, line.color, { size: 7.5, align: "center" });
    doc.text(xs[3] + cw(3) / 2, mid, line.size, { size: 7.5, align: "center" });
    doc.text(xs[4] + cw(4) / 2, mid, line.hsCode || "-", { size: 7.5, align: "center" });
    doc.text(xs[5] + cw(5) / 2, mid, line.origin, { size: 7.5, align: "center" });
    doc.text(xs[6] + cw(6) / 2, mid, String(line.qty), { size: 7.5, align: "center" });
    doc.text(xs[7] + 3, mid, symbol, { size: 7.5 });
    doc.text(xs[7] + cw(7) - 3, mid, num(line.unitPrice), { size: 7.5, align: "right" });
    doc.text(xs[8] + 3, mid, symbol, { size: 7.5 });
    doc.text(xs[8] + cw(8) - 3, mid, num(line.amount), { size: 7.5, align: "right" });
    doc.text(xs[9] + cw(9) / 2, mid, kg(line.netKg), { size: 7.5, align: "center" });
    doc.text(xs[10] + cw(10) / 2, mid, kg(line.grossKg), { size: 7.5, align: "center" });
    y += rh;
  }

  // ---- totals row
  if (y + 40 > BOTTOM) {
    doc.addPage();
    y = 40;
  }
  const totalUnits = d.lines.reduce((s, l) => s + l.qty, 0);
  const TH = 22;
  const VH = 13;
  const totalCells: { from: number; to: number; head: string[]; value: string; right?: boolean }[] = [
    { from: 0, to: 1, head: ["No. of Invoice Line Items"], value: String(d.lines.length) },
    { from: 6, to: 6, head: ["Total Units"], value: String(totalUnits) },
    { from: 8, to: 8, head: ["Total Goods", "Value", `& (${d.currency})`], value: `${symbol} ${num(d.merchandise)}` },
    { from: 9, to: 9, head: ["Total Net", "Weight"], value: kg(d.totalNetKg) },
    { from: 10, to: 10, head: ["Total Gross", "Weight"], value: kg(d.totalGrossKg) },
  ];
  for (const c of totalCells) {
    const x = xs[c.from];
    const w = xs[c.to + 1] - x;
    doc.rect(x, y, w, TH, 0.85, GRID);
    const size = c.head.length > 2 ? 5.6 : 6.6;
    const lh = size + 1.2;
    const top = y + (TH - c.head.length * lh) / 2 + size - 0.5;
    c.head.forEach((t, k) => doc.text(x + w / 2, top + k * lh, t, { size, bold: true, align: "center" }));
    doc.rect(x, y + TH, w, VH, undefined, GRID);
    doc.text(x + w / 2, y + TH + 9.2, c.value, { size: 7.5, bold: true, align: "center" });
  }
  y += TH + VH + 14;

  // ---- cost box (right) + certification (left)
  const boxW = 250;
  const bx = R - boxW;
  const labelW = 118;
  const costRows: [string, number, boolean][] = [
    ["Insurance Cost:", d.costs.insurance, false],
    ["Freight Cost:", d.costs.freight, false],
    ["Other Costs:", d.costs.other, false],
    ["TOTAL INVOICE VALUE:", d.total, true],
  ];
  const CH = 12;
  if (y + costRows.length * CH + 90 > H - 28) {
    doc.addPage();
    y = 40;
  }
  costRows.forEach(([label, value, strong], i) => {
    const ry = y + i * CH;
    doc.rect(bx, ry, labelW, CH, 0.85, GRID);
    doc.text(bx + 4, ry + 8.6, label, { size: 6.8, bold: true });
    doc.rect(bx + labelW, ry, boxW - labelW, CH, strong ? 0.85 : undefined, GRID);
    doc.text(bx + labelW + 4, ry + 8.6, symbol, { size: 7.2, bold: strong });
    doc.text(R - 4, ry + 8.6, num(value), { size: 7.2, bold: strong, align: "right" });
  });
  y += costRows.length * CH + 14;

  doc.text(L, y, "I/we certify the information on this invoice is true and correct and that the contents of this shipment are as stated above.", { size: 8 });
  y += 22;

  // ---- signature block
  const field = (label: string, value: string, lx: number, vx: number, ex: number, ty: number) => {
    doc.text(lx, ty, label, { size: 7.5 });
    doc.text(vx + 2, ty, value, { size: 7.5 });
    doc.line(vx, ty + 3, ex, ty + 3, 0.5, 0.2);
  };
  field("Name:", d.template.signer_name, L, L + 78, L + 255, y);
  field("E-mail:", d.template.signer_email, L + 300, L + 345, L + 520, y);
  field("Title:", d.template.signer_title, L + 560, L + 600, R, y);
  y += 20;
  field("Date:", day.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "/"), L, L + 78, L + 255, y);
  field("Signature:", "", L + 300, L + 345, R, y);
  y += 16;

  const block = (title: string, text: string) => {
    if (!text.trim()) return;
    const parts = wrapText(text, 7.5, R - L);
    if (y + 14 + parts.length * 10 > BOTTOM) {
      doc.addPage();
      y = 40;
    }
    doc.text(L, y, title, { size: 7, bold: true, gray: 0.35 });
    y += 10;
    for (const part of parts) {
      doc.text(L, y, part, { size: 7.5 });
      y += 10;
    }
    y += 6;
  };
  block("BANK DETAILS", d.template.bank_details);
  block("NOTES", d.template.notes);
  if (d.template.footer.trim()) {
    const parts = wrapText(d.template.footer, 7, R - L);
    let fy = H - 16 - parts.length * 9;
    for (const part of parts) {
      doc.text(W / 2, fy, part, { size: 7, gray: 0.4, align: "center" });
      fy += 9;
    }
  }
  return doc.build(`Invoice ${d.number}`);
}

export interface IssuedInvoice {
  id: string;
  number: string;
  storagePath: string;
}

/**
 * Issues (or re-renders) the invoice of a paid/shipped order. One active
 * invoice per order: calling it again keeps the number and regenerates the
 * PDF with the current template/order data (`regenerate`).
 */
export async function issueInvoice(orderId: string, staffId: string | null, regenerate = false): Promise<IssuedInvoice> {
  const supabase = createServiceRoleClient();
  const { data: order } = await supabase.from("orders").select("id, status").eq("id", orderId).maybeSingle();
  if (!order) throw new Error("Pedido não encontrado.");
  if (!["paid", "processing", "shipped", "delivered"].includes(order.status)) {
    throw new Error("A invoice só pode ser gerada para pedidos pagos ou enviados.");
  }

  const { data: existing } = await supabase.from("invoices").select("id, number, year, storage_path, issued_at").eq("order_id", orderId).eq("status", "issued").maybeSingle();
  if (existing && !regenerate && existing.storage_path) {
    return { id: existing.id, number: existing.number, storagePath: existing.storage_path };
  }

  let number: string;
  let year: number;
  let seq = 0;
  let issuedAt: string;
  const template = await getInvoiceTemplate();
  if (existing) {
    number = existing.number;
    year = existing.year;
    issuedAt = existing.issued_at;
  } else {
    const { data: next, error } = await supabase.rpc("next_invoice_number");
    if (error || !next || next.length === 0) throw new Error(error?.message ?? "Falha ao numerar a invoice.");
    year = next[0].invoice_year;
    seq = next[0].invoice_seq;
    number = `${template.number_prefix || "INV"}-${year}-${String(seq).padStart(4, "0")}`;
    issuedAt = new Date().toISOString();
  }

  const data = await buildInvoiceData(orderId, number, issuedAt);
  if (data.lines.length === 0) throw new Error("O pedido não tem itens ativos para faturar.");
  const pdf = renderInvoicePdf(data);
  const storagePath = `invoices/${year}/${number}.pdf`;
  const { error: upError } = await supabase.storage.from(INVOICE_BUCKET).upload(storagePath, pdf, { contentType: "application/pdf", upsert: true });
  if (upError) throw new Error(`Falha ao gravar o PDF: ${upError.message}`);

  if (existing) {
    const { error } = await supabase.from("invoices").update({ storage_path: storagePath, data, total: data.total, currency: data.currency }).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { id: existing.id, number, storagePath };
  }
  const { data: row, error } = await supabase
    .from("invoices")
    .insert({ order_id: orderId, year, seq, number, currency: data.currency, total: data.total, storage_path: storagePath, data, issued_at: issuedAt, issued_by: staffId })
    .select("id")
    .single();
  if (error || !row) throw new Error(error?.message ?? "Falha ao registrar a invoice.");
  return { id: row.id, number, storagePath };
}
