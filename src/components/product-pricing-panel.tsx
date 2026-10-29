"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setProductPricing } from "@/app/admin/precificacao/actions";

export interface ProductPricingData {
  id: string;
  original_price: number | null;
  extra_cost_brl: number | null;
  margin_pct_override: number | null;
  commission_pct_override: number | null;
  price_adjust_pct: number | null;
  price_brl: number | null;
  price_usd: number | null;
  price_eur: number | null;
  retail_usd: number | null;
  retail_eur: number | null;
  manual_price_usd?: number | null;
  manual_price_eur?: number | null;
}

export interface MarginInfo {
  cost_brl: number;
  fixed_brl: number;
  usd_rate: number;
  eur_rate: number;
  margin_usd: number | null;
  margin_eur: number | null;
  target: number;
  status: "OK" | "MARGIN_BELOW_TARGET" | "NO_PRICE";
}

/** Calculated prices + this product's exceptions to the global pricing rule. */
export function ProductPricingPanel({ product, margin: marginInfo }: { product: ProductPricingData; margin?: MarginInfo | null }) {
  const router = useRouter();
  const [margin, setMargin] = useState(product.margin_pct_override?.toString() ?? "");
  const [commission, setCommission] = useState(product.commission_pct_override?.toString() ?? "");
  const [adjust, setAdjust] = useState(String(product.price_adjust_pct ?? 0));
  const [extra, setExtra] = useState(String(product.extra_cost_brl ?? 0));
  const [manualUsd, setManualUsd] = useState(product.manual_price_usd?.toString() ?? "");
  const [manualEur, setManualEur] = useState(product.manual_price_eur?.toString() ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = "w-full border border-border px-2 py-1.5 text-sm";
  const n = (v: string) => Number(v.replace(",", "."));

  function save() {
    setMsg(null);
    start(async () => {
      const res = await setProductPricing(product.id, {
        marginPct: margin.trim() === "" ? null : n(margin),
        commissionPct: commission.trim() === "" ? null : n(commission),
        adjustPct: n(adjust || "0"),
        extraCost: n(extra || "0"),
        manualUsd: manualUsd.trim() === "" ? null : n(manualUsd),
        manualEur: manualEur.trim() === "" ? null : n(manualEur),
      });
      setMsg(res.error ?? "Preço recalculado.");
      router.refresh();
    });
  }

  const cell = (label: string, value: number | null, prefix: string) => (
    <div className="border border-border p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className="text-lg font-semibold">{value === null ? "—" : `${prefix} ${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`}</p>
    </div>
  );

  return (
    <section className="border border-border p-4 space-y-4 my-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide">Preço calculado</h2>
        <Link href="/admin/precificacao" className="text-xs underline">Regras de precificação →</Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {cell("PV R$", product.price_brl, "R$")}
        {cell("Site USD", product.price_usd, "USD")}
        {cell("Site EUR", product.price_eur, "EUR")}
        {cell("Retail USD", product.retail_usd, "USD")}
        {cell("Retail EUR", product.retail_eur, "EUR")}
      </div>
      <p className="text-xs text-muted">
        Calculado a partir do custo da peça (R$ {product.original_price ?? "—"}) e das regras globais. Exceções só deste produto (deixe vazio para seguir a regra global):
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <label className="space-y-1">
          <span>Margem % (exceção)</span>
          <input className={input} value={margin} onChange={(e) => setMargin(e.target.value)} placeholder="global" />
        </label>
        <label className="space-y-1">
          <span>Comissão % (exceção)</span>
          <input className={input} value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="global" />
        </label>
        <label className="space-y-1">
          <span>Ajuste no preço final %</span>
          <input className={input} value={adjust} onChange={(e) => setAdjust(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span>Custo extra por peça R$</span>
          <input className={input} value={extra} onChange={(e) => setExtra(e.target.value)} />
        </label>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <label className="space-y-1">
          <span>Preço fixo USD (não muda com câmbio/custo)</span>
          <input className={input} value={manualUsd} onChange={(e) => setManualUsd(e.target.value)} placeholder="automático" />
        </label>
        <label className="space-y-1">
          <span>Preço fixo EUR (não muda com câmbio/custo)</span>
          <input className={input} value={manualEur} onChange={(e) => setManualEur(e.target.value)} placeholder="automático" />
        </label>
      </div>
      {marginInfo && (
        <div className={`border p-3 text-xs space-y-1 ${marginInfo.status === "MARGIN_BELOW_TARGET" ? "border-red-300 bg-red-50" : "border-border"}`}>
          <p className="font-semibold uppercase tracking-wider">
            {marginInfo.status === "OK" ? "Margem OK" : marginInfo.status === "MARGIN_BELOW_TARGET" ? "Margem abaixo da meta" : "Sem preço calculado"}
          </p>
          <p>
            Custo equivalente R$ {marginInfo.cost_brl.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (peça + custos fixos R$ {marginInfo.fixed_brl.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} + extra) · câmbio usado USD {marginInfo.usd_rate} / EUR {marginInfo.eur_rate}
          </p>
          <p>
            Margem estimada: USD {marginInfo.margin_usd ?? "—"}% · EUR {marginInfo.margin_eur ?? "—"}% · meta {marginInfo.target}%
          </p>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={pending} className="bg-foreground text-background px-4 py-1.5 text-sm disabled:opacity-50">
          {pending ? "Salvando…" : "Salvar e recalcular"}
        </button>
        {msg && <span className="text-xs">{msg}</span>}
      </div>
    </section>
  );
}
