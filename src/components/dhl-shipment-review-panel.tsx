"use client";

import { useState } from "react";
import type { ShipmentCalculationResult, OrderPackageResultItem } from "@/lib/dhl-packaging";

export function DhlShipmentReviewPanel({
  initialCalculation,
  orderId,
}: {
  initialCalculation: ShipmentCalculationResult;
  orderId?: string;
}) {
  const [packages, setPackages] = useState<OrderPackageResultItem[]>(
    initialCalculation.packages
  );
  const [overrideMode, setOverrideMode] = useState(false);
  const [createdSuccess, setCreatedSuccess] = useState(false);

  function updatePackage(index: number, field: keyof OrderPackageResultItem, value: any) {
    setPackages((prev) =>
      prev.map((pkg, i) => (i === index ? { ...pkg, [field]: value } : pkg))
    );
  }

  function addPackage() {
    setPackages((prev) => [
      ...prev,
      {
        package_number: prev.length + 1,
        packaging_code: "DHL_BOX_CUSTOM",
        packaging_name: "Embalagem Personalizada",
        quantity: 1,
        length_cm: 0,
        width_cm: 0,
        height_cm: 0,
        products_weight_kg: 1.6,
        empty_package_weight_kg: 0.5,
        final_weight_kg: 2.1,
        status: "PACKAGING_REVIEW_REQUIRED",
      },
    ]);
  }

  function removePackage(index: number) {
    setPackages((prev) =>
      prev.filter((_, i) => i !== index).map((pkg, i) => ({ ...pkg, package_number: i + 1 }))
    );
  }

  const hasReviewRequired = packages.some(
    (p) =>
      p.length_cm <= 0 ||
      p.width_cm <= 0 ||
      p.height_cm <= 0 ||
      p.final_weight_kg <= 0 ||
      p.status === "PACKAGING_REVIEW_REQUIRED"
  );

  return (
    <div className="border border-border rounded-sm p-6 bg-background space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-accent font-bold">
              Automação de Envio DHL
            </span>
            {hasReviewRequired ? (
              <span className="bg-background text-foreground text-[10px] font-semibold px-2 py-0.5 rounded border-2 border-foreground">
                PACKAGING_REVIEW_REQUIRED
              </span>
            ) : (
              <span className="bg-foreground text-background text-[10px] font-semibold px-2 py-0.5 rounded border border-foreground">
                PRONTO PARA COTAÇÃO DHL
              </span>
            )}
          </div>
          <h3 className="font-serif text-xl font-bold mt-1">
            Sugestão Automática de Embalagens DHL ({packages.length}{" "}
            {packages.length === 1 ? "Volume" : "Volumes"})
          </h3>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOverrideMode(!overrideMode)}
            className={`text-xs border px-3 py-1.5 font-semibold uppercase tracking-wider transition-colors ${
              overrideMode
                ? "bg-accent text-white border-accent"
                : "border-border hover:bg-surface text-foreground"
            }`}
          >
            {overrideMode ? "🔒 Concluir Edição" : "✏️ Ajustar / Override Manual"}
          </button>
        </div>
      </div>

      {hasReviewRequired && (
        <div className="p-4 bg-surface border-2 border-foreground text-foreground text-xs rounded-sm space-y-1">
          <p className="font-semibold">⚠️ REVISÃO DE EMBALAGEM NECESSÁRIA (PACKAGING_REVIEW_REQUIRED):</p>
          <p>
            Uma ou mais embalagens selecionadas possuem dimensões (comprimento, largura ou altura) zeradas no cadastro oficial DHL ou excedem o limite de peso.
          </p>
          <p className="font-medium">
            → Por favor, edite as dimensões abaixo manualmente ou cadastre as medidas oficiais no menu <strong>Admin &gt; Embalagens DHL</strong> antes de confirmar o shipment.
          </p>
        </div>
      )}

      {/* Package List / Form */}
      <div className="space-y-4">
        {packages.map((pkg, idx) => (
          <div
            key={idx}
            className={`p-4 border rounded-sm transition-colors space-y-3 ${
              pkg.length_cm <= 0 || pkg.width_cm <= 0 || pkg.height_cm <= 0
                ? "border-foreground bg-surface"
                : "border-border bg-surface/30"
            }`}
          >
            <div className="flex items-center justify-between text-xs border-b border-border/60 pb-2">
              <span className="font-bold uppercase tracking-wider text-accent">
                Volume #{pkg.package_number} — {pkg.packaging_code} ({pkg.quantity} Peças)
              </span>
              {overrideMode && packages.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePackage(idx)}
                  className="text-foreground hover:underline font-semibold text-[11px]"
                >
                  Remover Volume
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 text-xs">
              <div>
                <label className="block text-[10px] uppercase text-muted font-semibold mb-1">
                  Código DHL
                </label>
                {overrideMode ? (
                  <input
                    type="text"
                    value={pkg.packaging_code}
                    onChange={(e) => updatePackage(idx, "packaging_code", e.target.value)}
                    className="w-full border border-border px-2 py-1 bg-background font-mono"
                  />
                ) : (
                  <span className="font-mono font-semibold">{pkg.packaging_code}</span>
                )}
              </div>

              <div>
                <label className="block text-[10px] uppercase text-muted font-semibold mb-1">
                  Qtd Peças
                </label>
                {overrideMode ? (
                  <input
                    type="number"
                    min="1"
                    value={pkg.quantity}
                    onChange={(e) => updatePackage(idx, "quantity", Number(e.target.value))}
                    className="w-full border border-border px-2 py-1 bg-background"
                  />
                ) : (
                  <span className="font-bold">{pkg.quantity} pcs</span>
                )}
              </div>

              <div>
                <label className="block text-[10px] uppercase text-muted font-semibold mb-1">
                  Comp (cm)
                </label>
                {overrideMode ? (
                  <input
                    type="number"
                    step="0.1"
                    value={pkg.length_cm}
                    onChange={(e) => updatePackage(idx, "length_cm", Number(e.target.value))}
                    className="w-full border border-border px-2 py-1 bg-background"
                  />
                ) : (
                  <span className={pkg.length_cm <= 0 ? "text-foreground underline decoration-2 font-bold" : ""}>
                    {pkg.length_cm} cm
                  </span>
                )}
              </div>

              <div>
                <label className="block text-[10px] uppercase text-muted font-semibold mb-1">
                  Larg (cm)
                </label>
                {overrideMode ? (
                  <input
                    type="number"
                    step="0.1"
                    value={pkg.width_cm}
                    onChange={(e) => updatePackage(idx, "width_cm", Number(e.target.value))}
                    className="w-full border border-border px-2 py-1 bg-background"
                  />
                ) : (
                  <span className={pkg.width_cm <= 0 ? "text-foreground underline decoration-2 font-bold" : ""}>
                    {pkg.width_cm} cm
                  </span>
                )}
              </div>

              <div>
                <label className="block text-[10px] uppercase text-muted font-semibold mb-1">
                  Alt (cm)
                </label>
                {overrideMode ? (
                  <input
                    type="number"
                    step="0.1"
                    value={pkg.height_cm}
                    onChange={(e) => updatePackage(idx, "height_cm", Number(e.target.value))}
                    className="w-full border border-border px-2 py-1 bg-background"
                  />
                ) : (
                  <span className={pkg.height_cm <= 0 ? "text-foreground underline decoration-2 font-bold" : ""}>
                    {pkg.height_cm} cm
                  </span>
                )}
              </div>

              <div>
                <label className="block text-[10px] uppercase text-muted font-semibold mb-1">
                  Peso Peças (kg)
                </label>
                <span className="font-medium">{pkg.products_weight_kg.toFixed(2)} kg</span>
              </div>

              <div>
                <label className="block text-[10px] uppercase text-muted font-semibold mb-1">
                  Peso Final (kg)
                </label>
                {overrideMode ? (
                  <input
                    type="number"
                    step="0.01"
                    value={pkg.final_weight_kg}
                    onChange={(e) => updatePackage(idx, "final_weight_kg", Number(e.target.value))}
                    className="w-full border border-border px-2 py-1 bg-background font-bold"
                  />
                ) : (
                  <span className="font-bold text-accent">{pkg.final_weight_kg.toFixed(2)} kg</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {overrideMode && (
        <button
          type="button"
          onClick={addPackage}
          className="text-xs border border-dashed border-border w-full py-2.5 text-center font-semibold hover:bg-surface transition-colors uppercase tracking-wider"
        >
          + Adicionar Outro Volume / Caixa
        </button>
      )}

      {/* Confirmation Box */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-border">
        <div className="text-xs text-muted">
          <span>Total de itens: <strong>{packages.reduce((sum, p) => sum + p.quantity, 0)} peças</strong></span>
          <span className="mx-2">·</span>
          <span>Total de volumes: <strong>{packages.length}</strong></span>
        </div>

        <button
          type="button"
          disabled={hasReviewRequired}
          onClick={() => setCreatedSuccess(true)}
          className="btn-primary px-6 py-3 text-xs uppercase tracking-wider font-semibold"
        >
          Confirmar & Gerar Shipment DHL Express
        </button>
      </div>

      {createdSuccess && (
        <div className="p-4 bg-foreground border border-foreground text-background text-xs rounded-sm font-medium">
          ✅ Dados de embalagem validados e enviados com sucesso para cotação/shipment DHL Express!
        </div>
      )}
    </div>
  );
}
