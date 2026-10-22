import { createClient } from "@/lib/supabase/server";
import { DutiesRulesEditor } from "@/components/duties-rules-editor";
import type { DutiesRule } from "@/lib/duties";

/**
 * Admin → Impostos e taxas por mercado. The order's "duties & taxes" field
 * defaults from the rule of the destination market; the buyer sees the mode
 * (prepaid / paid upon import / your choice) once the TDP informs the charges.
 */
export default async function AdminDutiesPage() {
  const supabase = await createClient();
  const { data: rules, error } = await supabase
    .from("duties_taxes_rules")
    .select("id, market_type, market, mode, default_pct, note, active")
    .order("market_type")
    .order("market");

  if (error) {
    return (
      <div className="max-w-3xl space-y-2">
        <h1 className="font-serif text-2xl">Impostos e taxas por mercado</h1>
        <p className="text-sm">
          A tabela ainda não existe neste banco. Rode <code>supabase/deploy/2026-10-25_apply_0062.sql</code> no SQL Editor do Supabase.
        </p>
        <pre className="text-xs bg-surface border border-border p-3 whitespace-pre-wrap">{error.message}</pre>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-serif text-2xl mb-1">Impostos e taxas por mercado</h1>
        <p className="text-sm text-muted max-w-2xl">
          Defina, por país ou região, como os impostos de importação são tratados: <strong>pré-pagos</strong>,{" "}
          <strong>pagos na importação</strong> ou <strong>escolha do cliente</strong>. A regra mais específica vale (país → região →
          padrão). O campo de impostos do pedido é pré-preenchido com o percentual padrão da regra, e o comprador vê o modo
          somente depois da confirmação de estoque.
        </p>
      </div>
      <DutiesRulesEditor rules={(rules ?? []).map((r) => ({ ...r, default_pct: r.default_pct === null ? null : Number(r.default_pct) })) as DutiesRule[]} />
    </div>
  );
}
