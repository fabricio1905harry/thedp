import { createClient } from "@/lib/supabase/server";
import { VolumeTiersEditor, type TierRow } from "@/components/volume-tiers-editor";
import { marginAfterDiscount, targetMargin, type MarginRules } from "@/lib/volume-pricing";

/**
 * Admin → Volume Pricing (OFF at launch). Tiers: quantity range → % discount
 * per operation / category, applied to cart and order totals only while the
 * master switch is ON. Each tier shows the margin it leaves versus the target.
 */
export default async function AdminVolumePricingPage() {
  const supabase = await createClient();
  const [{ data: tiers, error }, { data: setting }, { data: channels }, { data: cats }, { data: rules }, { data: target }] = await Promise.all([
    supabase.from("volume_pricing_tiers").select("*").order("operation", { nullsFirst: true }).order("category", { nullsFirst: true }).order("min_qty"),
    supabase.from("app_settings").select("value").eq("key", "volume_pricing").maybeSingle(),
    supabase.from("sales_channels").select("code, name").order("sort"),
    supabase.from("products").select("category").not("category", "is", null).limit(5000),
    supabase.from("pricing_rules").select("margin_pct, commission_pct, icms_pct, pis_cofins_pct, card_fee_pct").eq("id", 1).maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "margin_target_pct").maybeSingle(),
  ]);

  if (error) {
    return (
      <div className="max-w-3xl space-y-2">
        <h1 className="font-serif text-2xl">Volume Pricing</h1>
        <p className="text-sm">
          A tabela ainda não existe neste banco. Rode <code>supabase/deploy/2026-10-25_apply_0061.sql</code> no SQL Editor do Supabase.
        </p>
        <pre className="text-xs bg-surface border border-border p-3 whitespace-pre-wrap">{error.message}</pre>
      </div>
    );
  }

  const marginRules: MarginRules | null = rules
    ? {
        margin_pct: Number(rules.margin_pct),
        commission_pct: Number(rules.commission_pct),
        icms_pct: Number(rules.icms_pct),
        pis_cofins_pct: Number(rules.pis_cofins_pct),
        card_fee_pct: Number(rules.card_fee_pct),
      }
    : null;
  const goal = marginRules ? targetMargin(target?.value, marginRules) : null;
  const categories = [...new Set((cats ?? []).map((c) => c.category as string).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-serif text-2xl mb-1">Volume Pricing</h1>
        <p className="text-sm text-muted max-w-2xl">
          Descontos por volume (faixa de quantidade → % de desconto) por operação e, opcionalmente, por categoria. Fica{" "}
          <strong>DESLIGADO</strong> no lançamento: enquanto estiver desligado, nada muda no carrinho nem nos pedidos. Quando uma faixa
          faz a margem cair abaixo da meta, ela aparece em vermelho aqui e no Action Center
          (VOLUME PRICE BELOW TARGET MARGIN) — enquanto o recurso estiver ligado.
        </p>
      </div>
      <VolumeTiersEditor
        enabled={(setting?.value as { enabled?: boolean } | null)?.enabled === true}
        targetPct={goal}
        tiers={((tiers ?? []) as TierRow[]).map((t) => ({
          ...t,
          margin_pct: marginRules ? marginAfterDiscount(Number(t.discount_pct), marginRules) : null,
        }))}
        channels={channels ?? []}
        categories={categories}
      />
    </div>
  );
}
