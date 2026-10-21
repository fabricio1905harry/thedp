"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { computePrice, fixedTotal, type PricingRules } from "@/lib/pricing";
import { savePricingRules, recomputeAllPrices } from "@/app/admin/precificacao/actions";

const PCT_FIELDS: [keyof PricingRules, string][] = [
  ["margin_pct", "Margem desejada %"],
  ["commission_pct", "Comissão %"],
  ["icms_pct", "ICMS %"],
  ["pis_cofins_pct", "PIS/COFINS %"],
  ["card_fee_pct", "Taxa cartão internac. %"],
];

export function PricingRulesForm({ initial, autoRates }: { initial: PricingRules; autoRates: { usd: number | null; eur: number | null } }) {
  const router = useRouter();
  const [rules, setRules] = useState<PricingRules>(initial);
  const [sampleCost, setSampleCost] = useState(429);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const rates =
    rules.fx_mode === "auto"
      ? { usd: autoRates.usd ?? rules.usd_rate, eur: autoRates.eur ?? rules.eur_rate }
      : { usd: rules.usd_rate, eur: rules.eur_rate };
  const preview = computePrice(sampleCost, rules, {}, rates);
  const pctSum = PCT_FIELDS.reduce((s, [k]) => s + Number(rules[k] || 0), 0);

  const set = <K extends keyof PricingRules>(k: K, v: PricingRules[K]) => setRules((r) => ({ ...r, [k]: v }));
  const input = "w-full border border-border px-2 py-1.5 text-sm";

  function save() {
    setMsg(null);
    start(async () => {
      const res = await savePricingRules(rules);
      setMsg(res.error ?? `Regras salvas — ${res.count ?? 0} produtos atualizados com os novos preços.`);
      router.refresh();
    });
  }
  function recompute() {
    setMsg(null);
    start(async () => {
      const res = await recomputeAllPrices();
      setMsg(res.error ?? `${res.count} produtos recalculados.`);
      router.refresh();
    });
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-6">
        <section className="border border-border p-4 space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide">Custos fixos por peça (R$)</h2>
          <div className="space-y-2">
            {rules.fixed_costs.map((c, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  className={`${input} flex-1`}
                  value={c.label}
                  onChange={(e) => set("fixed_costs", rules.fixed_costs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                />
                <input
                  type="number"
                  step="0.01"
                  className={`${input} w-28`}
                  value={c.amount}
                  onChange={(e) => set("fixed_costs", rules.fixed_costs.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))}
                />
                <button type="button" onClick={() => set("fixed_costs", rules.fixed_costs.filter((_, j) => j !== i))} className="text-xs text-muted hover:text-red-600 px-2">
                  remover
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs">
            <button type="button" onClick={() => set("fixed_costs", [...rules.fixed_costs, { label: "Novo custo", amount: 0 }])} className="border border-border px-3 py-1.5">
              + Adicionar custo
            </button>
            <span>
              Total por peça: <strong>R$ {fixedTotal(rules).toFixed(2)}</strong>
            </span>
          </div>
        </section>

        <section className="border border-border p-4 space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide">Custos % sobre o preço final</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {PCT_FIELDS.map(([k, label]) => (
              <label key={k} className="text-xs space-y-1">
                <span>{label}</span>
                <input type="number" step="0.01" className={input} value={rules[k] as number} onChange={(e) => set(k, Number(e.target.value) as never)} />
              </label>
            ))}
          </div>
          <p className={`text-xs ${pctSum >= 95 ? "text-red-600" : "text-muted"}`}>Custos + despesas: {pctSum.toFixed(2)}% (precisa ser menor que 95%)</p>
        </section>

        <section className="border border-border p-4 space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide">Câmbio e arredondamento</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <label className="space-y-1">
              <span>Origem do câmbio</span>
              <select className={input} value={rules.fx_mode} onChange={(e) => set("fx_mode", e.target.value as PricingRules["fx_mode"])}>
                <option value="manual">Fixo (desta tela)</option>
                <option value="auto">Automático (Admin → Câmbio)</option>
              </select>
            </label>
            <label className="space-y-1">
              <span>USD (R$ por 1 USD)</span>
              <input type="number" step="0.0001" className={input} value={rules.usd_rate} onChange={(e) => set("usd_rate", Number(e.target.value))} />
            </label>
            <label className="space-y-1">
              <span>EUR (R$ por 1 EUR)</span>
              <input type="number" step="0.0001" className={input} value={rules.eur_rate} onChange={(e) => set("eur_rate", Number(e.target.value))} />
            </label>
            <label className="space-y-1">
              <span>Arredondamento USD/EUR</span>
              <select className={input} value={rules.rounding} onChange={(e) => set("rounding", e.target.value as PricingRules["rounding"])}>
                <option value="up_to_9">Para cima, terminando em 9 (219, 229…)</option>
                <option value="up_to_integer">Para cima, inteiro</option>
                <option value="none">Sem arredondar (centavos)</option>
              </select>
            </label>
          </div>
          {rules.fx_mode === "auto" && (
            <p className="text-xs text-muted">
              Câmbio automático atual: USD {autoRates.usd ?? "—"} · EUR {autoRates.eur ?? "—"}. Os valores fixos acima só são usados se não houver cotação.
            </p>
          )}
        </section>

        <section className="border border-border p-4 space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide">Preço ao consumidor final (Retail sugerido)</h2>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <label className="space-y-1">
              <span>Frete internacional %</span>
              <input type="number" step="0.01" className={input} value={rules.intl_freight_pct} onChange={(e) => set("intl_freight_pct", Number(e.target.value))} />
            </label>
            <label className="space-y-1">
              <span>Impostos locais %</span>
              <input type="number" step="0.01" className={input} value={rules.local_taxes_pct} onChange={(e) => set("local_taxes_pct", Number(e.target.value))} />
            </label>
            <label className="space-y-1">
              <span>Markup varejo (×)</span>
              <input type="number" step="0.01" className={input} value={rules.retail_markup} onChange={(e) => set("retail_markup", Number(e.target.value))} />
            </label>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={save} disabled={pending || pctSum >= 95} className="bg-foreground text-background px-5 py-2 text-sm disabled:opacity-50">
            {pending ? "Atualizando…" : "Salvar e atualizar preços dos produtos"}
          </button>
          <button onClick={recompute} disabled={pending} className="border border-border px-4 py-2 text-sm">
            Atualizar produtos com as regras salvas
          </button>
          {msg && <span className="text-xs">{msg}</span>}
        </div>
      </div>

      <aside className="border border-border p-4 space-y-3 h-fit lg:sticky lg:top-6">
        <h2 className="text-sm font-medium uppercase tracking-wide">Simulação</h2>
        <label className="text-xs space-y-1 block">
          <span>Custo da peça (R$)</span>
          <input type="number" step="0.01" className={input} value={sampleCost} onChange={(e) => setSampleCost(Number(e.target.value))} />
        </label>
        {preview ? (
          <dl className="text-sm space-y-1.5">
            <Row k="Custos fixos" v={`R$ ${preview.fixed.toFixed(2)}`} />
            <Row k="Custo total" v={`R$ ${preview.totalCost.toFixed(2)}`} />
            <Row k="Custos + despesas %" v={`${(preview.pct * 100).toFixed(2)}%`} />
            <Row k="PV final R$" v={`R$ ${preview.brl.toFixed(2)}`} strong />
            <Row k="Site USD" v={preview.usd !== null ? `USD ${preview.usd}` : "—"} strong />
            <Row k="Site EUR" v={preview.eur !== null ? `EUR ${preview.eur}` : "—"} strong />
            <Row k="Retail USD" v={preview.retailUsd !== null ? `USD ${preview.retailUsd.toFixed(2)}` : "—"} />
            <Row k="Retail EUR" v={preview.retailEur !== null ? `EUR ${preview.retailEur.toFixed(2)}` : "—"} />
          </dl>
        ) : (
          <p className="text-xs text-muted">Informe um custo maior que zero.</p>
        )}
        <p className="text-[11px] text-muted">A simulação usa as regras da tela (mesmo antes de salvar).</p>
      </aside>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/60 pb-1">
      <dt className="text-muted">{k}</dt>
      <dd className={strong ? "font-semibold" : undefined}>{v}</dd>
    </div>
  );
}
