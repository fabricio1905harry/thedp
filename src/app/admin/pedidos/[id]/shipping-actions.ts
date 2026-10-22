"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/admin-auth";
import {
  createShipment,
  dhlMode,
  getTracking,
  requestPickup,
  type DhlParty,
} from "@/lib/dhl-adapter";

/**
 * Shipping (DHL) workflow — admin server actions. Every action returns
 * { error?, info? } (production Next hides thrown messages).
 * Documents live in the private bucket `shipment-docs`.
 */

export type ActionResult = { error?: string; info?: string };

const BUCKET = "shipment-docs";
const SHIPMENT_STATUSES = ["CREATED", "PICKUP_REQUESTED", "IN_TRANSIT", "DELIVERED", "EXCEPTION"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

async function guarded(fn: (staffId: string) => Promise<ActionResult>): Promise<ActionResult> {
  try {
    const staff = await getCurrentStaff();
    if (!staff) return { error: "Não autorizado" };
    return await fn(staff.id);
  } catch (err) {
    console.error("[admin/pedidos/shipping]", err);
    return { error: err instanceof Error ? err.message : "Falha na ação." };
  }
}

function refresh(orderId: string) {
  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin");
}

interface AddressJson {
  name?: string;
  company?: string;
  address?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  postal_code?: string;
  countryCode?: string;
  country?: string;
  phone?: string;
}

async function loadShipper(): Promise<{ party: DhlParty; missing: string[] }> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "invoice_template").maybeSingle();
  const t = (data?.value ?? {}) as Record<string, string>;
  const party: DhlParty = {
    companyName: t.company_name ?? "",
    fullName: t.company_name ?? "",
    email: t.company_email || undefined,
    phone: t.company_phone || undefined,
    addressLine1: t.company_address ?? "",
    city: t.company_city ?? "",
    postalCode: t.company_postal_code ?? "",
    countryCode: (t.company_country_code || "BR").toUpperCase(),
  };
  const missing: string[] = [];
  if (!party.addressLine1) missing.push("endereço");
  if (!party.city) missing.push("cidade");
  if (!party.postalCode) missing.push("CEP");
  return { party, missing };
}

export interface CreateShipmentInput {
  orderId: string;
  plannedDate: string; // YYYY-MM-DD
  packages: { lengthCm: number; widthCm: number; heightCm: number; weightKg: number }[];
}

export async function createShipmentAction(input: CreateShipmentInput): Promise<ActionResult> {
  return guarded(async (staffId) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.plannedDate)) return { error: "Data de envio inválida." };
    if (input.packages.length === 0 || input.packages.some((p) => ![p.lengthCm, p.widthCm, p.heightCm, p.weightKg].every((n) => Number.isFinite(n) && n > 0))) {
      return { error: "Todos os volumes precisam de dimensões e peso maiores que zero." };
    }
    const supabase = await createClient();
    const { data: order } = await supabase
      .from("orders")
      .select("id, order_number, status, currency, subtotal, incoterm, shipping_address, customer_id")
      .eq("id", input.orderId)
      .maybeSingle();
    if (!order) return { error: "Pedido não encontrado." };
    if (!["paid", "processing", "shipped", "delivered"].includes(order.status)) {
      return { error: "O envio só pode ser criado depois do pagamento integral do pedido." };
    }
    const { data: existing } = await supabase.from("shipments").select("id").eq("order_id", order.id).limit(1);
    if (existing && existing.length > 0) return { error: "Este pedido já possui um envio." };

    const { data: customer } = await supabase.from("customers").select("email, name, company_name, phone").eq("id", order.customer_id).maybeSingle();
    const addr = (order.shipping_address ?? {}) as AddressJson;
    const receiver: DhlParty = {
      companyName: addr.company || customer?.company_name || addr.name || customer?.name || "",
      fullName: addr.name || customer?.name || customer?.company_name || "Destinatário",
      email: customer?.email,
      phone: addr.phone || customer?.phone || undefined,
      addressLine1: addr.address || addr.line1 || "",
      addressLine2: addr.line2,
      city: addr.city || "",
      state: addr.state,
      postalCode: addr.postalCode || addr.postal_code || "",
      countryCode: (addr.countryCode || addr.country || "").toUpperCase().slice(0, 2),
    };
    const shipper = await loadShipper();
    if (dhlMode() === "real") {
      if (shipper.missing.length > 0) return { error: `Preencha os dados do remetente em Configurações da invoice: ${shipper.missing.join(", ")}.` };
      if (!receiver.addressLine1 || !receiver.city || !receiver.postalCode || receiver.countryCode.length !== 2) {
        return { error: "Endereço de entrega incompleto (rua, cidade, CEP e país de 2 letras)." };
      }
    }

    const { data: items } = await supabase.from("order_items").select("qty, item_status, product_title").eq("order_id", order.id);
    const active = (items ?? []).filter((i) => i.item_status === "available" || i.item_status === "requested");
    const pieces = active.reduce((s, i) => s + Number(i.qty), 0);

    let result;
    try {
      result = await createShipment({
        reference: order.order_number ?? order.id.slice(0, 8),
        shipper: shipper.party,
        receiver,
        packages: input.packages,
        declaredValue: Number(order.subtotal),
        currency: order.currency,
        description: `Women's apparel (dresses) - ${pieces} pcs`,
        incoterm: order.incoterm || "DAP",
        plannedShippingDate: input.plannedDate,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "A DHL recusou o envio." };
    }

    const totalWeight = input.packages.reduce((s, p) => s + p.weightKg, 0);
    const { data: created, error } = await supabase
      .from("shipments")
      .insert({
        order_id: order.id,
        carrier: "DHL",
        dhl_tracking: result.trackingNumber,
        tracking_url: result.trackingUrl,
        shipment_reference: order.order_number,
        is_mock: result.isMock,
        status: "CREATED",
        packages: input.packages,
        total_weight_kg: Math.round(totalWeight * 1000) / 1000,
        provider_payload: result.isMock ? { mock: true } : null,
        created_by: staffId,
      })
      .select("id");
    if (error) return { error: error.message };
    if (!created || created.length === 0) return { error: "O envio não foi gravado (sem permissão?)." };

    // label / waybill files returned by DHL
    const service = createServiceRoleClient();
    for (const doc of result.documents) {
      const path = `shipments/${created[0].id}/${crypto.randomUUID()}-${doc.fileName}`;
      const buffer = Buffer.from(doc.base64, "base64");
      const { error: upError } = await service.storage.from(BUCKET).upload(path, buffer, { contentType: doc.contentType });
      if (!upError) {
        await service.from("shipment_documents").insert({
          shipment_id: created[0].id,
          order_id: order.id,
          kind: doc.kind,
          file_name: doc.fileName,
          storage_path: path,
          content_type: doc.contentType,
          size_bytes: buffer.length,
          uploaded_by: staffId,
        });
      }
    }
    refresh(order.id);
    return {
      info: result.isMock
        ? "Envio criado em modo MOCK (sem credenciais DHL): o código de rastreio é fictício."
        : `Envio criado na DHL. Rastreio ${result.trackingNumber}.`,
    };
  });
}

export async function requestPickupAction(shipmentId: string, pickupDate: string, readyBy: string, closeTime: string): Promise<ActionResult> {
  return guarded(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate) || !/^\d{2}:\d{2}$/.test(readyBy) || !/^\d{2}:\d{2}$/.test(closeTime)) {
      return { error: "Data/horários inválidos." };
    }
    const supabase = await createClient();
    const { data: shipment } = await supabase.from("shipments").select("id, order_id, status, dhl_tracking, is_mock, packages, total_weight_kg").eq("id", shipmentId).maybeSingle();
    if (!shipment) return { error: "Envio não encontrado." };
    if (shipment.status !== "CREATED") return { error: "A coleta só pode ser solicitada para envios com status CREATED." };
    const shipper = await loadShipper();
    if (!shipment.is_mock && shipper.missing.length > 0) return { error: `Preencha os dados do remetente em Configurações da invoice: ${shipper.missing.join(", ")}.` };

    let pickup;
    try {
      pickup = await requestPickup({
        trackingNumber: shipment.dhl_tracking ?? "",
        pickupDate,
        readyByTime: readyBy,
        closeTime,
        shipper: shipper.party,
        packagesCount: Array.isArray(shipment.packages) ? shipment.packages.length : 1,
        totalWeightKg: Number(shipment.total_weight_kg ?? 1),
      });
    } catch (err) {
      await supabase.from("shipments").update({ last_error: err instanceof Error ? err.message : "erro" }).eq("id", shipmentId);
      return { error: err instanceof Error ? err.message : "A DHL recusou a coleta." };
    }
    const { data, error } = await supabase
      .from("shipments")
      .update({ status: "PICKUP_REQUESTED", pickup_date: pickupDate, pickup_reference: pickup.confirmation, last_error: null })
      .eq("id", shipmentId)
      .select("id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "Nada foi salvo (sem permissão?)." };
    refresh(shipment.order_id);
    return { info: pickup.isMock ? "Coleta registrada em modo MOCK (nenhuma solicitação foi feita à DHL)." : `Coleta solicitada. Confirmação ${pickup.confirmation}.` };
  });
}

/** Manual status change / timeline note (also how a MOCK shipment is advanced). */
export async function setShipmentStatusAction(shipmentId: string, status: ShipmentStatus, note: string, location: string): Promise<ActionResult> {
  return guarded(async (staffId) => {
    if (!SHIPMENT_STATUSES.includes(status)) return { error: "Status inválido." };
    const supabase = await createClient();
    const { data: shipment } = await supabase.from("shipments").select("id, order_id, status, is_mock").eq("id", shipmentId).maybeSingle();
    if (!shipment) return { error: "Envio não encontrado." };
    if (status !== shipment.status) {
      const { data, error } = await supabase.from("shipments").update({ status, last_error: status === "EXCEPTION" ? note || "Exceção registrada" : null }).eq("id", shipmentId).select("id");
      if (error) return { error: error.message };
      if (!data || data.length === 0) return { error: "Nada foi salvo (sem permissão?)." };
    }
    if (note.trim() || location.trim()) {
      const { error } = await supabase.from("shipment_events").insert({
        shipment_id: shipmentId,
        status,
        description: note.trim() || null,
        location: location.trim() || null,
        source: "manual",
        created_by: staffId,
      });
      if (error) return { error: error.message };
    }
    refresh(shipment.order_id);
    return { info: "Status atualizado." };
  });
}

/** Pulls DHL tracking events (real mode only) and moves the shipment forward. */
export async function refreshTrackingAction(shipmentId: string): Promise<ActionResult> {
  return guarded(async () => {
    const supabase = await createClient();
    const { data: shipment } = await supabase.from("shipments").select("id, order_id, status, dhl_tracking, is_mock").eq("id", shipmentId).maybeSingle();
    if (!shipment?.dhl_tracking) return { error: "Envio sem código de rastreio." };
    if (shipment.is_mock) return { error: "Envio MOCK: não há rastreio real. Atualize o status manualmente." };
    let tracking;
    try {
      tracking = await getTracking(shipment.dhl_tracking);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Falha ao consultar a DHL." };
    }
    const { data: known } = await supabase.from("shipment_events").select("occurred_at, description").eq("shipment_id", shipmentId).eq("source", "dhl");
    const seen = new Set((known ?? []).map((e) => `${new Date(e.occurred_at).toISOString()}|${e.description}`));
    const fresh = tracking.events.filter((e) => !seen.has(`${e.occurredAt}|${e.description}`));
    if (fresh.length > 0) {
      await supabase.from("shipment_events").insert(
        fresh.map((e) => ({
          shipment_id: shipmentId,
          status: e.status || shipment.status,
          description: e.description,
          location: e.location,
          occurred_at: e.occurredAt,
          source: "dhl",
        }))
      );
    }
    const order = ["CREATED", "PICKUP_REQUESTED", "IN_TRANSIT", "DELIVERED"];
    if (tracking.status && (tracking.status === "EXCEPTION" || order.indexOf(tracking.status) > order.indexOf(shipment.status))) {
      await supabase.from("shipments").update({ status: tracking.status }).eq("id", shipmentId);
    }
    refresh(shipment.order_id);
    return { info: `${fresh.length} novo(s) evento(s) de rastreio.` };
  });
}

const DOC_KINDS = ["commercial_invoice", "packing_list", "label", "other"] as const;

export async function uploadShipmentDocument(formData: FormData): Promise<ActionResult> {
  return guarded(async (staffId) => {
    const shipmentId = String(formData.get("shipmentId") ?? "");
    const kind = String(formData.get("kind") ?? "other");
    const visible = formData.get("visible") === "on";
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Escolha um arquivo." };
    if (file.size > 15 * 1024 * 1024) return { error: "Arquivo acima de 15 MB." };
    if (!DOC_KINDS.includes(kind as (typeof DOC_KINDS)[number])) return { error: "Tipo de documento inválido." };
    const supabase = await createClient();
    const { data: shipment } = await supabase.from("shipments").select("id, order_id").eq("id", shipmentId).maybeSingle();
    if (!shipment) return { error: "Envio não encontrado." };

    const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "documento";
    const path = `shipments/${shipmentId}/${crypto.randomUUID()}-${safeName}`;
    const service = createServiceRoleClient();
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upError } = await service.storage.from(BUCKET).upload(path, buffer, { contentType: file.type || "application/octet-stream" });
    if (upError) return { error: `Falha ao enviar o arquivo: ${upError.message}` };
    const { data, error } = await supabase
      .from("shipment_documents")
      .insert({
        shipment_id: shipmentId,
        order_id: shipment.order_id,
        kind,
        file_name: safeName,
        storage_path: path,
        content_type: file.type || null,
        size_bytes: file.size,
        visible_to_buyer: visible && kind === "commercial_invoice",
        uploaded_by: staffId,
      })
      .select("id");
    if (error || !data?.length) {
      await service.storage.from(BUCKET).remove([path]);
      return { error: error?.message ?? "Documento não gravado." };
    }
    refresh(shipment.order_id);
    return { info: "Documento enviado." };
  });
}

export async function deleteShipmentDocument(documentId: string): Promise<ActionResult> {
  return guarded(async () => {
    const supabase = await createClient();
    const { data: doc } = await supabase.from("shipment_documents").select("id, order_id, storage_path").eq("id", documentId).maybeSingle();
    if (!doc) return { error: "Documento não encontrado." };
    const { data, error } = await supabase.from("shipment_documents").delete().eq("id", documentId).select("id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "Nada foi removido (sem permissão?)." };
    await createServiceRoleClient().storage.from(BUCKET).remove([doc.storage_path]);
    refresh(doc.order_id);
    return { info: "Documento removido." };
  });
}

/** Short-lived signed URL (staff only) for a stored document. */
export async function getShipmentDocumentUrl(documentId: string): Promise<{ url?: string; error?: string }> {
  try {
    const staff = await getCurrentStaff();
    if (!staff) return { error: "Não autorizado" };
    const supabase = await createClient();
    const { data: doc } = await supabase.from("shipment_documents").select("storage_path, file_name").eq("id", documentId).maybeSingle();
    if (!doc) return { error: "Documento não encontrado." };
    const { data, error } = await createServiceRoleClient().storage.from(BUCKET).createSignedUrl(doc.storage_path, 120, { download: doc.file_name });
    if (error || !data) return { error: error?.message ?? "Não foi possível gerar o link." };
    return { url: data.signedUrl };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao gerar o link." };
  }
}

// ---------------------------------------------------------------------
// Product preparation checklist
// ---------------------------------------------------------------------

const PREP_TASKS = ["labels", "tags", "bagging"] as const;

export async function setPrepTask(orderId: string, orderItemId: string, task: (typeof PREP_TASKS)[number], done: boolean): Promise<ActionResult> {
  return guarded(async (staffId) => {
    if (!PREP_TASKS.includes(task)) return { error: "Tarefa inválida." };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("order_prep_items")
      .upsert(
        { order_id: orderId, order_item_id: orderItemId, task, done, done_at: done ? new Date().toISOString() : null, done_by: done ? staffId : null },
        { onConflict: "order_item_id,task" }
      )
      .select("id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "Nada foi salvo (sem permissão?)." };
    revalidatePath(`/admin/pedidos/${orderId}`);
    return {};
  });
}

/** Marks a task done for every active line of the order. */
export async function setPrepTaskForAll(orderId: string, task: (typeof PREP_TASKS)[number], done: boolean): Promise<ActionResult> {
  return guarded(async (staffId) => {
    if (!PREP_TASKS.includes(task)) return { error: "Tarefa inválida." };
    const supabase = await createClient();
    const { data: items } = await supabase.from("order_items").select("id, item_status").eq("order_id", orderId);
    const rows = (items ?? [])
      .filter((i) => i.item_status === "available" || i.item_status === "requested")
      .map((i) => ({ order_id: orderId, order_item_id: i.id, task, done, done_at: done ? new Date().toISOString() : null, done_by: done ? staffId : null }));
    if (rows.length === 0) return { error: "O pedido não tem linhas ativas." };
    const { data, error } = await supabase.from("order_prep_items").upsert(rows, { onConflict: "order_item_id,task" }).select("id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "Nada foi salvo (sem permissão?)." };
    revalidatePath(`/admin/pedidos/${orderId}`);
    return {};
  });
}
