import { createClient } from "@/lib/supabase/server";
import { CustomerApprovalRow, type Applicant } from "@/components/customer-approval-row";

async function getApplicants() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("customers")
      .select(
        "id, email, name, created_at, status, company_name, tax_id, company_address, delivery_address, website, instagram, phone, business_type, has_physical_store, store_count, brands_carried, application_message, referral_code, review_note, locale"
      )
      .in("status", ["pending", "more_info"])
      .eq("role", "customer")
      .order("created_at", { ascending: true });
    return (data ?? []) as Applicant[];
  } catch {
    return null;
  }
}

export default async function AdminClientesPage() {
  const applicants = await getApplicants();

  return (
    <div className="max-w-4xl">
      <h1 className="font-serif text-2xl mb-1">Contas atacado pendentes</h1>
      <p className="text-sm text-muted mb-6">Aprove, rejeite ou solicite mais informações. A aprovação coloca na fila o e-mail de “conta aprovada”.</p>
      {applicants === null ? (
        <p className="text-sm text-muted">Banco ainda não provisionado — nada para mostrar.</p>
      ) : applicants.length === 0 ? (
        <p className="text-sm text-muted">Nenhum cadastro pendente.</p>
      ) : (
        <div className="space-y-3">
          {applicants.map((a) => (
            <CustomerApprovalRow key={`${a.id}-${a.status}`} customer={a} />
          ))}
        </div>
      )}
    </div>
  );
}
