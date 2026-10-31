import { createClient } from "@/lib/supabase/server";
import { PricingRulesForm } from "@/components/pricing-rules-form";
import { BulkPricingPanel, type PricedProduct } from "@/components/bulk-pricing-panel";
import type { PricingRules } from "@/lib/pricing";
import { CategoryMargins } from "@/components/category-margins";

/**
 * Pricing engine (spreadsheet "Tabela de preço - TDP EXP"): global rules,
 * live simulation and mass adjustments. Prices are computed in the database
 * (migration 0035) whenever a product is inserted/updated or the rules change.
 */
export default async function AdminPricingPage({ searchParams }: { searchParams: Promise<{ category?: string; status?: string; q?: string }> }) {
  const { category = "", status = "", q = "" } = await searchParams;
  const supabase = await createClient();

  const { data: rules, error: rulesError } = await supabase.from("pricing_rules").select("*").eq("id", 1).maybeSingle();
  if (rulesError || !rules) {
    return (
      <div className="max-w-3xl space-y-2">
        <h1 className="font-serif text-2xl">Precificação</h1>
        <p className="text-sm">
          A tabela de regras ainda não existe neste banco. Rode <code>supabase/deploy/2026-10-21_apply_0035.sql</code> no SQL Editor do Supabase.
        </p>
        {rulesError && <pre className="text-xs bg-surface border border-border p-3 whitespace-pre-wrap">{rulesError.message}</pre>}
      </div>
    );
  }

  const [{ data: usd }, { data: eur }, { data: cats }, { data: catMargins }] = await Promise.all([
    supabase.from("fx_rates").select("rate").eq("base", "BRL").eq("quote", "USD").order("fetched_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("fx_rates").select("rate").eq("base", "BRL").eq("quote", "EUR").order("fetched_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("products").select("category").not("category", "is", null).limit(5000),
    supabase.from("category_pricing").select("category, margin_pct"),
  ]);
  const categories = [...new Set((cats ?? []).map((c) => c.category as string).filter(Boolean))].sort();

  let query = supabase
    .from("products")
    .select(
      "id, title, category, status, original_price, extra_cost_brl, margin_pct_override, commission_pct_override, price_adjust_pct, price_brl, price_usd, price_eur, retail_usd, retail_eur",
      { count: "exact" }
    )
    .order("title")
    .limit(300);
  if (category) query = query.eq("category", category);
  if (status) query = query.eq("status", status);
  if (q) query = query.ilike("title", `%${q.replace(/[%_]/g, "")}%`);
  const { data: products, count } = await query;

  const initial: PricingRules = {
    fixed_costs: (rules.fixed_costs as PricingRules["fixed_costs"]) ?? [],
    margin_pct: Number(rules.margin_pct),
    commission_pct: Number(rules.commission_pct),
    icms_pct: Number(rules.icms_pct),
    pis_cofins_pct: Number(rules.pis_cofins_pct),
    card_fee_pct: Number(rules.card_fee_pct),
    fx_mode: rules.fx_mode,
    usd_rate: Number(rules.usd_rate),
    eur_rate: Number(rules.eur_rate),
    rounding: rules.rounding,
    intl_freight_pct: Number(rules.intl_freight_pct),
    local_taxes_pct: Number(rules.local_taxes_pct),
    retail_markup: Number(rules.retail_markup),
    recalc_on_cost_change: Boolean(rules.recalc_on_cost_change),
  };

  return (
    <div className="max-w-6xl space-y-10">
      <div>
        <h1 className="font-serif text-2xl mb-1">Precificação</h1>
        <p className="text-sm text-muted max-w-3xl">
          Regra da planilha “Tabela de preço — TDP EXP”. Todo produto recebe o preço automaticamente ao ser cadastrado (n8n/ingest só precisa
          enviar o custo da peça). Quando o custo do fornecedor muda o preço de venda NÃO muda sozinho (padrão do PDF): o produto vai para o Action
          Center se a margem ficar abaixo da meta. A meta de margem é única: a margem desejada abaixo, por categoria ou por produto.
        </p>
      </div>

      <PricingRulesForm initial={initial} autoRates={{ usd: usd ? Number(usd.rate) : null, eur: eur ? Number(eur.rate) : null }} />

      <CategoryMargins
        categories={categories}
        globalMargin={Number(rules.margin_pct)}
        values={Object.fromEntries((catMargins ?? []).map((c) => [c.category as string, c.margin_pct === null ? null : Number(c.margin_pct)]))}
      />

      <section className="space-y-3">
        <div>
          <h2 className="font-serif text-xl">Ajuste de preços em massa</h2>
          <p className="text-sm text-muted">Filtre, selecione e aplique margem, comissão, ajuste %, custo extra ou reajuste de custo em vários produtos de uma vez.</p>
        </div>
        <BulkPricingPanel products={(products ?? []) as PricedProduct[]} categories={categories} filter={{ category, status, q }} total={count ?? 0} />
      </section>
    </div>
  );
}
