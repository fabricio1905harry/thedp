import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ContactMessageRow, type ContactRow } from "@/components/contact-message-row";

const FILTERS = [
  ["", "Todos"],
  ["new", "NOVO"],
  ["in_progress", "EM ANDAMENTO"],
  ["resolved", "RESOLVIDO"],
] as const;

export default async function AdminContactsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("contact_messages")
    .select("id, created_at, name, company, email, phone, country, subject, message, locale, status, internal_note, customer_id")
    .order("created_at", { ascending: false })
    .limit(300);
  if (status) query = query.eq("status", status);
  const { data } = await query;
  const rows = (data ?? []) as ContactRow[];

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="font-serif text-2xl mb-1">Contatos recebidos</h1>
        <p className="text-sm text-muted">Mensagens do formulário da página Contact. Novas mensagens aparecem no Action Center até serem tratadas.</p>
      </div>
      <div className="flex gap-2 text-xs">
        {FILTERS.map(([value, label]) => (
          <Link key={value} href={value ? `/admin/contatos?status=${value}` : "/admin/contatos"} className={`border px-3 py-1.5 ${(status ?? "") === value ? "border-foreground font-semibold" : "border-border"}`}>
            {label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma mensagem.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <ContactMessageRow key={`${row.id}-${row.status}`} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
