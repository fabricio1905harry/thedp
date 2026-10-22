import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CustomerApprovalRow, type Applicant } from "@/components/customer-approval-row";
import { CHANNEL_LABELS } from "@/lib/payments";
import { countryName } from "@/lib/countries";

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

interface BuyerRow {
  id: string;
  email: string;
  name: string | null;
  company_name: string | null;
  country: string | null;
  channel: string | null;
  status: string;
  approved_at: string | null;
}

async function getBuyers(search: string) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  try {
    const supabase = await createClient();
    let query = supabase
      .from("customers")
      .select("id, email, name, company_name, country, channel, status, approved_at")
      .eq("role", "customer")
      .eq("status", "approved")
      .order("company_name", { ascending: true, nullsFirst: false })
      .limit(500);
    const q = search.replace(/[%,()]/g, " ").trim();
    if (q) query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%,company_name.ilike.%${q}%`);
    const { data } = await query;
    const buyers = (data ?? []) as BuyerRow[];
    if (buyers.length === 0) return [];

    const { data: orders } = await supabase
      .from("orders")
      .select("customer_id, status, currency, total")
      .in("customer_id", buyers.map((b) => b.id))
      .neq("status", "canceled");
    const stats = new Map<string, { count: number; totals: Map<string, number> }>();
    for (const o of orders ?? []) {
      const s = stats.get(o.customer_id) ?? { count: 0, totals: new Map<string, number>() };
      s.count++;
      s.totals.set(o.currency, (s.totals.get(o.currency) ?? 0) + Number(o.total ?? 0));
      stats.set(o.customer_id, s);
    }
    return buyers.map((b) => ({ ...b, orders: stats.get(b.id) ?? { count: 0, totals: new Map<string, number>() } }));
  } catch {
    return [];
  }
}

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);

export default async function AdminClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const [applicants, buyers] = await Promise.all([getApplicants(), getBuyers(q)]);

  return (
    <div className="max-w-6xl space-y-10">
      <section>
        <h1 className="font-serif text-2xl mb-1">Clientes</h1>
        <p className="text-sm text-muted mb-4">Compradores aprovados, com empresa, país, canal e histórico de pedidos (pedidos cancelados não entram na soma).</p>
        <form className="flex gap-2 mb-4" action="/admin/clientes">
          <input name="q" defaultValue={q} placeholder="Buscar por nome, empresa ou e-mail" className="border border-border rounded-lg px-3 py-2 text-sm w-full max-w-sm" />
          <button type="submit" className="btn-primary px-4 py-2 text-sm">Buscar</button>
          {q && (
            <Link href="/admin/clientes" className="px-3 py-2 text-sm underline">
              Limpar
            </Link>
          )}
        </form>
        {buyers.length === 0 ? (
          <p className="text-sm text-muted">{q ? "Nenhum cliente encontrado para essa busca." : "Nenhum cliente aprovado ainda."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted border-b border-border">
                  <th className="py-2 pr-4">Empresa / contato</th>
                  <th className="py-2 pr-4">País</th>
                  <th className="py-2 pr-4">Canal</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Pedidos</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {buyers.map((b) => (
                  <tr key={b.id} className="border-b border-border align-top">
                    <td className="py-2 pr-4">
                      <p className="font-medium">{b.company_name || b.name || b.email}</p>
                      <p className="text-xs text-muted">
                        {b.name && b.company_name ? `${b.name} · ` : ""}
                        {b.email}
                      </p>
                    </td>
                    <td className="py-2 pr-4">{b.country ? `${countryName(b.country, "pt")} (${b.country})` : "—"}</td>
                    <td className="py-2 pr-4">{b.channel ? CHANNEL_LABELS[b.channel] ?? b.channel : "—"}</td>
                    <td className="py-2 pr-4">Aprovado</td>
                    <td className="py-2 pr-4">{b.orders.count}</td>
                    <td className="py-2 pr-4">
                      {b.orders.totals.size === 0
                        ? "—"
                        : [...b.orders.totals.entries()].map(([cur, total]) => <span key={cur} className="block">{money(total, cur)}</span>)}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <Link href={`/admin/pagamentos?cliente=${encodeURIComponent(b.email)}`} className="underline text-xs">
                        Exceções de pagamento
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="max-w-4xl">
        <h2 className="font-serif text-xl mb-1">Contas atacado pendentes</h2>
        <p className="text-sm text-muted mb-4">Aprove, rejeite ou solicite mais informações. A aprovação coloca na fila o e-mail de “conta aprovada”.</p>
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
      </section>
    </div>
  );
}
