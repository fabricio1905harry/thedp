import { createClient } from "@/lib/supabase/server";

async function getCounts() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const supabase = await createClient();
    const [pendingCustomers, draftProducts, publishedProducts, orders] =
      await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "draft"),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "published"),
        supabase.from("orders").select("id", { count: "exact", head: true }),
      ]);

    return {
      pendingCustomers: pendingCustomers.count ?? 0,
      draftProducts: draftProducts.count ?? 0,
      publishedProducts: publishedProducts.count ?? 0,
      orders: orders.count ?? 0,
    };
  } catch {
    return null;
  }
}

export default async function AdminOverviewPage() {
  const counts = await getCounts();

  return (
    <div>
      <h1 className="font-serif text-2xl mb-6">Visão geral</h1>
      {!counts ? (
        <p className="text-sm text-muted">
          Sem conexão com o banco ainda — os números aparecem assim que o
          Supabase estiver provisionado (task #2) e a migração aplicada
          (task #3).
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Cadastros pendentes" value={counts.pendingCustomers} />
          <Stat label="Produtos rascunho" value={counts.draftProducts} />
          <Stat label="Produtos publicados" value={counts.publishedProducts} />
          <Stat label="Pedidos" value={counts.orders} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border p-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted mt-1">{label}</p>
    </div>
  );
}
