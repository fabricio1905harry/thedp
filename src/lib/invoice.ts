import { getColorResolver } from "@/lib/colors";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { PAGE_WIDTH, PdfDocument, wrapText } from "@/lib/pdf-writer";

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
}

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplate = {
  number_prefix: "INV",
  company_name: "The Dressing Project",
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
};

export interface InvoiceLine {
  description: string;
  sku: string;
  hsCode: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

export interface InvoiceData {
  number: string;
  issuedAt: string;
  orderNumber: string;
  currency: string;
  incoterm: string;
  template: InvoiceTemplate;
  consignee: { name: string; company: string; lines: string[]; taxId: string };
  lines: InvoiceLine[];
  charges: { label: string; amount: number }[];
  merchandise: number;
  total: number;
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

async function buildInvoiceData(orderId: string, number: string, issuedAt: string): Promise<InvoiceData> {
  const supabase = createServiceRoleClient();
  const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) throw new Error("Pedido não encontrado.");
  const [{ data: items }, { data: customer }, { data: shipment }, template] = await Promise.all([
    supabase.from("order_items").select("qty, unit_price, item_status, product_title, sku, color, size, product_id").eq("order_id", orderId).order("id"),
    supabase.from("customers").select("name, company_name, tax_id").eq("id", order.customer_id).maybeSingle(),
    supabase.from("shipments").select("dhl_tracking, is_mock").eq("order_id", orderId).limit(1).maybeSingle(),
    getInvoiceTemplate(),
  ]);

  const active = (items ?? []).filter((i) => i.item_status === "available" || i.item_status === "requested");
  const productIds = [...new Set(active.map((i) => i.product_id).filter(Boolean))] as string[];
  const hsByProduct = new Map<string, string>();
  const titleEnByProduct = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: products } = await supabase.from("products").select("id, hs_code, title_en").in("id", productIds);
    for (const p of products ?? []) {
      hsByProduct.set(p.id, hs6(p.hs_code));
      if (p.title_en) titleEnByProduct.set(p.id, p.title_en);
    }
  }
  // The invoice is ALWAYS in English: product name and color, whatever the buyer's language.
  const colorsEn = await getColorResolver("en");

  const lines: InvoiceLine[] = active.map((i) => ({
    description: `${(i.product_id && titleEnByProduct.get(i.product_id)) || i.product_title || "Item"}${i.color ? ` - ${colorsEn.label(i.color)}` : ""}${i.size ? ` / ${i.size}` : ""}`,
    sku: "", // internal variant codes never go on the commercial invoice
    hsCode: (i.product_id && hsByProduct.get(i.product_id)) || "",
    qty: Number(i.qty),
    unitPrice: Number(i.unit_price),
    amount: Math.round(Number(i.qty) * Number(i.unit_price) * 100) / 100,
  }));
  const merchandise = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const charges = CHARGE_LABELS.map(([key, label]) => ({ label, amount: Number(order[key] ?? 0) })).filter((c) => c.amount > 0);
  const total = Math.round((merchandise + charges.reduce((s, c) => s + c.amount, 0)) * 100) / 100;

  const addr = (order.shipping_address ?? {}) as Record<string, string>;
  const consigneeLines = [
    addr.address || addr.line1,
    addr.line2,
    [addr.city, addr.state, addr.postalCode || addr.postal_code].filter(Boolean).join(", "),
    addr.countryCode || addr.country,
  ].filter(Boolean) as string[];

  return {
    number,
    issuedAt,
    orderNumber: order.order_number ?? order.id.slice(0, 8),
    currency: order.currency,
    incoterm: order.incoterm || "DAP",
    template,
    consignee: {
      name: addr.name || customer?.name || "",
      company: customer?.company_name || addr.company || "",
      lines: consigneeLines,
      taxId: customer?.tax_id || "",
    },
    lines,
    charges,
    merchandise,
    total,
    trackingNumber: shipment && !shipment.is_mock ? shipment.dhl_tracking : null,
  };
}

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function renderInvoicePdf(d: InvoiceData): Uint8Array {
  const doc = new PdfDocument();
  const L = 40;
  const R = PAGE_WIDTH - 40;
  let y = 48;

  doc.text(L, y, d.template.company_name, { size: 16, bold: true });
  doc.text(R, y, "COMMERCIAL INVOICE", { size: 14, bold: true, align: "right" });
  y += 16;
  const company = [
    d.template.company_address,
    [d.template.company_city, d.template.company_postal_code, d.template.company_country_code].filter(Boolean).join(" - "),
    d.template.company_tax_id && `Tax ID: ${d.template.company_tax_id}`,
    [d.template.company_email, d.template.company_phone].filter(Boolean).join("  |  "),
  ].filter(Boolean) as string[];
  let cy = y;
  for (const line of company) {
    for (const part of wrapText(line, 8.5, 250)) {
      doc.text(L, cy, part, { size: 8.5, gray: 0.25 });
      cy += 11;
    }
  }
  const meta: [string, string][] = [
    ["Invoice no.", d.number],
    ["Date", new Date(d.issuedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })],
    ["Order", d.orderNumber],
    ["Incoterm", d.incoterm],
    ["Country of origin", d.template.origin_country],
    ...(d.trackingNumber ? ([["Tracking", d.trackingNumber]] as [string, string][]) : []),
  ];
  let my = y;
  for (const [k, v] of meta) {
    doc.text(R - 120, my, k, { size: 8.5, gray: 0.35 });
    doc.text(R, my, v, { size: 9, bold: true, align: "right" });
    my += 12;
  }
  y = Math.max(cy, my) + 14;

  doc.line(L, y, R, y, 0.8);
  y += 14;
  doc.text(L, y, "CONSIGNEE / BILL TO", { size: 8, bold: true, gray: 0.35 });
  y += 12;
  const consignee = [d.consignee.company, d.consignee.name !== d.consignee.company ? d.consignee.name : "", ...d.consignee.lines, d.consignee.taxId && `Tax ID: ${d.consignee.taxId}`].filter(Boolean) as string[];
  for (const line of consignee) {
    doc.text(L, y, line, { size: 9.5 });
    y += 12;
  }
  y += 10;

  // table
  const cols = { desc: L + 4, hs: 300, qty: 392, unit: 468, amt: R - 4 };
  const header = () => {
    doc.rect(L, y - 11, R - L, 17, 0.93);
    doc.text(cols.desc, y, "Description", { size: 8, bold: true });
    doc.text(cols.hs, y, "HS code", { size: 8, bold: true });
    doc.text(cols.qty, y, "Qty", { size: 8, bold: true, align: "right" });
    doc.text(cols.unit, y, "Unit price", { size: 8, bold: true, align: "right" });
    doc.text(cols.amt, y, "Amount", { size: 8, bold: true, align: "right" });
    y += 16;
  };
  header();
  for (const line of d.lines) {
    const desc = wrapText(line.description + (line.sku ? ` (${line.sku})` : ""), 9, cols.hs - cols.desc - 8);
    const height = desc.length * 11 + 4;
    if (y + height > 760) {
      doc.addPage();
      y = 50;
      header();
    }
    desc.forEach((part, i) => doc.text(cols.desc, y + i * 11, part, { size: 9 }));
    doc.text(cols.hs, y, line.hsCode || "-", { size: 9 });
    doc.text(cols.qty, y, String(line.qty), { size: 9, align: "right" });
    doc.text(cols.unit, y, line.unitPrice.toFixed(2), { size: 9, align: "right" });
    doc.text(cols.amt, y, line.amount.toFixed(2), { size: 9, align: "right" });
    y += height;
    doc.line(L, y - 3, R, y - 3, 0.25, 0.8);
  }

  if (y > 690) {
    doc.addPage();
    y = 50;
  }
  y += 8;
  const totalRow = (label: string, value: string, bold = false) => {
    doc.text(R - 150, y, label, { size: bold ? 10.5 : 9.5, bold });
    doc.text(cols.amt, y, value, { size: bold ? 10.5 : 9.5, bold, align: "right" });
    y += bold ? 16 : 13;
  };
  totalRow("Merchandise", money(d.merchandise, d.currency));
  for (const c of d.charges) totalRow(c.label, money(c.amount, d.currency));
  doc.line(R - 150, y - 8, R, y - 8, 0.6);
  totalRow("TOTAL", money(d.total, d.currency), true);
  const totalPieces = d.lines.reduce((s, l) => s + l.qty, 0);
  doc.text(L, y - 16, `${totalPieces} piece(s)`, { size: 9, gray: 0.35 });
  y += 10;

  const block = (title: string, text: string) => {
    if (!text.trim()) return;
    const parts = wrapText(text, 8.5, R - L);
    if (y + 14 + parts.length * 11 > 800) {
      doc.addPage();
      y = 50;
    }
    doc.text(L, y, title, { size: 8, bold: true, gray: 0.35 });
    y += 12;
    for (const part of parts) {
      doc.text(L, y, part, { size: 8.5 });
      y += 11;
    }
    y += 8;
  };
  block("BANK DETAILS", d.template.bank_details);
  block("NOTES", d.template.notes);
  if (d.template.footer.trim()) {
    const parts = wrapText(d.template.footer, 8, R - L);
    let fy = 815 - parts.length * 10;
    for (const part of parts) {
      doc.text(PAGE_WIDTH / 2, fy, part, { size: 8, gray: 0.4, align: "center" });
      fy += 10;
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
