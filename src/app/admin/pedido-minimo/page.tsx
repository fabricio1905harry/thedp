import { createClient } from "@/lib/supabase/server";
import { MinimumRulesEditor, type MinimumRuleRow } from "@/components/minimum-rules-editor";

/**
 * Admin → Regras de pedido mínimo. Launch default: no rule / everything OFF.
 * The cart and the checkout action read the ACTIVE rules (src/lib/commercial-server.ts).
 */
export default async function AdminMinimumOrderPage() {
  const supabase = await createClient();
  const [{ data: rules, error }, { data: channels }, { data: cats }, { data: brandRows }] = await Promise.all([
    supabase.from("order_minimum_rules").select("*").order("sort").order("created_at"),
    supabase.from("sales_channels").select("code, name").order("sort"),
    supabase.from("products").select("category").not("category", "is", null).limit(5000),
    supabase.from("products").select("brand").not("brand", "is", null).limit(5000),
  ]);

  if (error) {
    return (
      <div className="max-w-3xl space-y-2">
        <h1 className="font-serif text-2xl">Regras de pedido mínimo</h1>
        <p className="text-sm">
          A tabela ainda não existe neste banco. Rode <code>supabase/deploy/2026-10-25_apply_0061.sql</code> no SQL Editor do Supabase.
        </p>
        <pre className="text-xs bg-surface border border-border p-3 whitespace-pre-wrap">{error.message}</pre>
      </div>
    );
  }

  const productIds = (rules ?? []).filter((r) => r.scope === "product" && r.scope_value).map((r) => r.scope_value as string);
  const { data: products } = productIds.length
    ? await supabase.from("products").select("id, title").in("id", productIds)
    : { data: [] as { id: string; title: string }[] };

  const unique = (values: (string | null)[]) => [...new Set(values.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b));
  const productTitle = new Map((products ?? []).map((p) => [p.id as string, p.title as string]));

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-serif text-2xl mb-1">Regras de pedido mínimo</h1>
        <p className="text-sm text-muted max-w-2xl">
          Defina um mínimo em valor ou em unidades por operação, categoria, marca ou produto. Regras <strong>desligadas</strong> não
          têm efeito — no lançamento não há pedido mínimo. Com uma regra ativa e não atendida, o carrinho mostra quanto falta
          (ex.: “Add 2 more Dresses to place your order”) e o botão de enviar o Order Request fica bloqueado; o servidor também
          recusa o pedido.
        </p>
      </div>
      <MinimumRulesEditor
        rules={((rules ?? []) as MinimumRuleRow[]).map((r) => ({
          ...r,
          scope_label: r.scope === "product" ? (productTitle.get(r.scope_value ?? "") ?? r.scope_value) : r.scope_value,
        }))}
        channels={channels ?? []}
        categories={unique((cats ?? []).map((c) => c.category as string | null))}
        brands={unique((brandRows ?? []).map((b) => b.brand as string | null))}
      />
    </div>
  );
}
