import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Authenticated download of private documents (bucket shipment-docs).
 *   /api/documents/invoice/<invoice id>   commercial invoice (staff or the buyer of the order)
 *   /api/documents/shipment/<document id> shipment document (staff, or the buyer when visible_to_buyer)
 * Access is decided by RLS on the signed-in user's own client; only then is a
 * short-lived signed URL created with the service role and the browser is
 * redirected to it. The bucket itself is never public.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let path: string | null = null;
  let fileName = "document.pdf";
  if (kind === "invoice") {
    const { data } = await supabase.from("invoices").select("storage_path, number, status").eq("id", id).maybeSingle();
    if (data?.storage_path && data.status === "issued") {
      path = data.storage_path;
      fileName = `${data.number}.pdf`;
    }
  } else if (kind === "shipment") {
    const { data } = await supabase.from("shipment_documents").select("storage_path, file_name").eq("id", id).maybeSingle();
    if (data) {
      path = data.storage_path;
      fileName = data.file_name;
    }
  }
  if (!path) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: signed, error } = await createServiceRoleClient().storage.from("shipment-docs").createSignedUrl(path, 60, { download: fileName });
  if (error || !signed) return NextResponse.json({ error: "Could not open the document" }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl, 302);
}
