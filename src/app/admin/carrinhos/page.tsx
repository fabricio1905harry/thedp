import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AbandonedCartSettings } from "@/components/abandoned-cart-settings";

interface CartRow {
  id: string;
  status: "active" | "ordered" | "emptied";
  currency: string | null;
  item_count: number;
  total_value: number;
  last_activity_at: string;
  reminder_1_sent_at: string | null;
  reminder_2_sent_at: string | null;
  recovery_clicked_at: string | null;
  order_id: string | null;
  ordered_at: string | null;
  customers: { email: string; name: string | null; company_name: string | null } | { email: string; name: string | null; company_name: string | null }[] | null;
  cart_items: { title: string | null; color: string | null; size: string | null; qty: number }[];
}

const FILTERS = [
  ["", "Abandonados"],
  ["recovered", "Recuperados"],
  ["all", "Todos"],
] as const;

function currentTime() {
  return Date.now();
}

export default async function AdminAbandonedCartsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const supabase = await createClient();
  const [{ data }, { data: settings }] = await Promise.all([
    supabase
      .from("carts")
      .select("id, status, currency, item_count, total_value, last_activity_at, reminder_1_sent_at, reminder_2_sent_at, recovery_clicked_at, order_id, ordered_at, customers ( email, name, company_name ), cart_items ( title, color, size, qty )")
      .order("last_activity_at", { ascending: false })
      .limit(300),
    supabase.from("app_settings").select("key, value").in("key", ["abandoned_cart_enabled", "abandoned_cart_hours_1", "abandoned_cart_hours_2"]),
  ]);
  const cfg = Object.fromEntries((settings ?? []).map((s) => [s.key, s.value]));
  const hours1 = Number(cfg.abandoned_cart_hours_1 ?? 2);

  const now = currentTime();
  const all = (data ?? []) as unknown as CartRow[];
  const isRecovered = (c: CartRow) => c.status === "ordered" && Boolean(c.reminder_1_sent_at);
  const isAbandoned = (c: CartRow) => c.status === "active" && c.item_count > 0 && now - new Date(c.last_activity_at).getTime() >= hours1 * 3600_000;
  const rows = all.filter((c) => (f === "all" ? true : f === "recovered" ? isRecovered(c) : isAbandoned(c)));
  const abandonedValue = all.filter(isAbandoned);

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="font-serif text-2xl mb-1">Carrinhos abandonados</h1>
        <p className="text-sm text-muted">
          Carrinhos de compradores logados, sincronizados do site. {abandonedValue.length} abandonado(s) agora · {all.filter(isRecovered).length} recuperado(s) (pedido enviado após lembrete).
        </p>
      </div>

      <AbandonedCartSettings enabled={cfg.abandoned_cart_enabled !== false} hours1={hours1} hours2={Number(cfg.abandoned_cart_hours_2 ?? 24)} />

      <div className="flex gap-2 text-xs">
        {FILTERS.map(([value, label]) => (
          <Link key={value} href={value ? `/admin/carrinhos?f=${value}` : "/admin/carrinhos"} className={`border px-3 py-1.5 ${(f ?? "") === value ? "border-foreground font-semibold" : "border-border"}`}>
            {label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nenhum carrinho nesta lista.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr>
                <th className="p-2">Comprador</th>
                <th className="p-2">Itens</th>
                <th className="p-2">Valor</th>
                <th className="p-2">Última atividade</th>
                <th className="p-2">Lembretes</th>
                <th className="p-2">Situação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const cust = Array.isArray(c.customers) ? c.customers[0] : c.customers;
                return (
                  <tr key={c.id} className="border-t border-border align-top">
                    <td className="p-2">
                      <strong>{cust?.company_name || cust?.name || cust?.email || "—"}</strong>
                      <span className="block text-muted">{cust?.email}</span>
                    </td>
                    <td className="p-2">
                      {c.item_count} peça(s)
                      <span className="block text-muted max-w-xs">
                        {c.cart_items.slice(0, 3).map((i) => `${i.title ?? ""} ${i.color ?? ""}/${i.size ?? ""} ×${i.qty}`).join(" · ")}
                        {c.cart_items.length > 3 ? ` … +${c.cart_items.length - 3}` : ""}
                      </span>
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {Number(c.total_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} {c.currency}
                    </td>
                    <td className="p-2 whitespace-nowrap">{new Date(c.last_activity_at).toLocaleString("pt-BR")}</td>
                    <td className="p-2">
                      {c.reminder_1_sent_at ? `1: ${new Date(c.reminder_1_sent_at).toLocaleString("pt-BR")}` : "1: —"}
                      <br />
                      {c.reminder_2_sent_at ? `2: ${new Date(c.reminder_2_sent_at).toLocaleString("pt-BR")}` : "2: —"}
                      {c.recovery_clicked_at && <span className="block text-muted">clicou no link</span>}
                    </td>
                    <td className="p-2">
                      {isRecovered(c) ? (
                        <span className="font-semibold">RECUPERADO</span>
                      ) : c.status === "ordered" ? (
                        "Pedido enviado"
                      ) : c.status === "emptied" ? (
                        "Esvaziado"
                      ) : isAbandoned(c) ? (
                        "ABANDONADO"
                      ) : (
                        "Ativo"
                      )}
                      {c.order_id && (
                        <Link href={`/admin/pedidos/${c.order_id}`} className="block text-accent underline">
                          ver pedido
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
