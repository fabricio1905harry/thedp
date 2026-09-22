import { createClient } from "@/lib/supabase/server";
import { CustomerApprovalRow } from "@/components/customer-approval-row";

async function getPendingCustomers() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("customers")
      .select("id, email, name, created_at, customer_type, company_name")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    return data ?? [];
  } catch {
    return null;
  }
}

export default async function AdminClientesPage() {
  const pending = await getPendingCustomers();

  return (
    <div>
      <h1 className="font-serif text-2xl mb-6">Cadastros pendentes</h1>
      {pending === null ? (
        <p className="text-sm text-muted">
          Banco ainda não provisionado (task #2) — nada para mostrar.
        </p>
      ) : pending.length === 0 ? (
        <p className="text-sm text-muted">Nenhum cadastro pendente.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted uppercase border-b border-border">
              <th className="py-2 pr-4">Nome</th>
              <th className="py-2 pr-4">Tipo</th>
              <th className="py-2 pr-4">E-mail</th>
              <th className="py-2 pr-4">Criado em</th>
              <th className="py-2">Ação</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((customer) => (
              <CustomerApprovalRow key={customer.id} customer={customer} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
