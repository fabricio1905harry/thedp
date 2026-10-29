import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Avise-me — Admin" };

interface Req {
  id: string;
  product_id: string;
  created_at: string;
  notified_at: string | null;
  customers: { email: string; name: string | null; company_name: string | null } | null;
  products: { title: string; slug: string } | null;
  variants: { color: string | null; size: string | null } | null;
}

export default async function NotifyAdminPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const { product } = await searchParams;
  const supabase = await createClient();
  let q = supabase
    .from("notify_requests")
    .select("id, product_id, created_at, notified_at, customers ( email, name, company_name ), products ( title, slug ), variants ( color, size )")
    .order("created_at", { ascending: false })
    .limit(500);
  if (product) q = q.eq("product_id", product);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Req[];
  const waiting = rows.filter((r) => !r.notified_at);

  const byProduct = new Map<string, { title: string; slug: string; buyers: Set<string>; n: number }>();
  for (const r of waiting) {
    const e = byProduct.get(r.product_id) ?? { title: r.products?.title ?? "—", slug: r.products?.slug ?? "", buyers: new Set<string>(), n: 0 };
    e.buyers.add(r.customers?.email ?? r.id);
    e.n++;
    byProduct.set(r.product_id, e);
  }
  const demand = [...byProduct.entries()].sort((a, b) => b[1].buyers.size - a[1].buyers.size);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="font-serif text-2xl">Avise-me (reposição)</h1>
        <p className="text-sm text-muted mt-1">
          Compradores que pediram aviso quando uma peça esgotada voltar. Quando o estoque passa de 0 para mais de 0, o e-mail
          (<code>notify_back_in_stock</code>) entra na fila e o pedido é marcado como avisado.
        </p>
        {product && <Link href="/admin/avise-me" className="text-xs underline">ver todos os produtos</Link>}
      </div>

      <section className="border border-border p-4">
        <h2 className="text-sm font-semibold mb-2">Demanda de reposição ({waiting.length} pedido(s) aguardando)</h2>
        {demand.length === 0 ? (
          <p className="text-sm text-muted">Ninguém aguardando reposição.</p>
        ) : (
          <ul className="text-sm divide-y divide-border">
            {demand.map(([pid, d]) => (
              <li key={pid} className="py-2 flex justify-between gap-3">
                <Link href={`/admin/produtos/${pid}`} className="underline">{d.title}</Link>
                <span>{d.buyers.size} comprador(es)</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="p-2">Comprador</th>
              <th className="p-2">Produto</th>
              <th className="p-2">Cor / tamanho (fornecedor)</th>
              <th className="p-2">Pedido em</th>
              <th className="p-2">Avisado em</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="p-4 text-muted">Nenhum pedido de aviso.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-2">{r.customers?.company_name || r.customers?.name || "—"}<span className="block text-xs text-muted">{r.customers?.email}</span></td>
                <td className="p-2">{r.products?.title}</td>
                <td className="p-2">{r.variants?.color ?? "—"} / {r.variants?.size ?? "—"}</td>
                <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                <td className="p-2 whitespace-nowrap">{r.notified_at ? new Date(r.notified_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "aguardando"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
