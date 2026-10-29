import { createClient } from "@/lib/supabase/server";

export default async function AdminNewsletterPage() {
  const supabase = await createClient();
  const [{ data, error }, { count }] = await Promise.all([
    supabase.from("newsletter_subscribers").select("id, email, locale, source, created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("newsletter_subscribers").select("id", { count: "exact", head: true }),
  ]);

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="font-serif text-2xl mb-1">Newsletter</h1>
        <p className="text-sm text-muted">
          {count ?? 0} inscritos pelo formulário “Stay in the know” do rodapé. Título, texto e botão ficam em Conteúdo do site → Barras do site → Rodapé — newsletter.
        </p>
      </div>
      {error && <p className="text-sm text-red-700">{error.message}</p>}
      {(data ?? []).length === 0 ? (
        <p className="text-sm text-muted">Nenhum inscrito ainda.</p>
      ) : (
        <table className="w-full text-sm border border-border">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-border">
              <th className="p-2">E-mail</th>
              <th className="p-2">Idioma</th>
              <th className="p-2">Origem</th>
              <th className="p-2">Data</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((r) => (
              <tr key={r.id} className="border-b border-border/60">
                <td className="p-2">{r.email}</td>
                <td className="p-2">{r.locale ?? "—"}</td>
                <td className="p-2">{r.source ?? "—"}</td>
                <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
