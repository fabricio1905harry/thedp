import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BRAND_STATUS_LABELS, BrandApplicationRowView, type BrandApplicationRow } from "@/components/brand-application-row";

export default async function AdminBrandApplicationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("brand_applications")
    .select("id, created_at, brand_name, contact_name, email, phone, website, instagram, country, message, status, notes")
    .order("created_at", { ascending: false })
    .limit(300);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  const rows = (data ?? []) as BrandApplicationRow[];

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="font-serif text-2xl mb-1">Candidaturas de marcas</h1>
        <p className="text-sm text-muted">
          Formulário “Become a Brand” do site. Candidaturas novas aparecem no Action Center até serem tratadas. A página pública fica em /seja-uma-marca.
        </p>
      </div>
      {error && <p className="text-sm text-red-700">{error.message}</p>}
      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/admin/candidaturas-marcas" className={`border px-3 py-1.5 ${!status ? "border-foreground font-semibold" : "border-border"}`}>Todas</Link>
        {Object.entries(BRAND_STATUS_LABELS).map(([value, label]) => (
          <Link key={value} href={`/admin/candidaturas-marcas?status=${value}`} className={`border px-3 py-1.5 ${status === value ? "border-foreground font-semibold" : "border-border"}`}>
            {label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted">Nenhuma candidatura.</p> : <div className="space-y-2">{rows.map((r) => <BrandApplicationRowView key={`${r.id}-${r.status}`} row={r} />)}</div>}
    </div>
  );
}
