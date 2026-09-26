"use client";

import { useState } from "react";
import {
  savePackagingType,
  togglePackagingType,
  saveCapacityRule,
  toggleCapacityRule,
} from "@/app/admin/embalagens/actions";
import type { PackagingType, CapacityRule } from "@/lib/dhl-packaging";

export function PackagingManager({
  types,
  rules,
}: {
  types: PackagingType[];
  rules: CapacityRule[];
}) {
  const [tab, setTab] = useState<"types" | "rules">("types");
  const [editingType, setEditingType] = useState<Partial<PackagingType> | null>(null);
  const [editingRule, setEditingRule] = useState<Partial<CapacityRule> | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSaveTypeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const res = await savePackagingType(formData);
    setLoading(false);
    if (res.success) {
      setEditingType(null);
    } else {
      alert(`Erro ao salvar embalagem: ${res.error}`);
    }
  }

  async function handleSaveRuleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const res = await saveCapacityRule(formData);
    setLoading(false);
    if (res.success) {
      setEditingRule(null);
    } else {
      alert(`Erro ao salvar regra: ${res.error}`);
    }
  }

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex border-b border-border gap-6">
        <button
          onClick={() => setTab("types")}
          className={`pb-3 text-sm font-semibold tracking-wide uppercase transition-colors ${
            tab === "types"
              ? "border-b-2 border-accent text-accent"
              : "text-muted hover:text-foreground"
          }`}
        >
          Cadastro de Embalagens DHL ({types.length})
        </button>
        <button
          onClick={() => setTab("rules")}
          className={`pb-3 text-sm font-semibold tracking-wide uppercase transition-colors ${
            tab === "rules"
              ? "border-b-2 border-accent text-accent"
              : "text-muted hover:text-foreground"
          }`}
        >
          Regras de Capacidade por Categoria ({rules.length})
        </button>
      </div>

      {/* TAB 1: EMBALAGENS DHL */}
      {tab === "types" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted">
              Gerencie as medidas oficiais DHL, peso da embalagem vazia e limite máximo de peso.
            </p>
            <button
              onClick={() =>
                setEditingType({
                  code: "",
                  name: "",
                  lengthCm: 0,
                  widthCm: 0,
                  heightCm: 0,
                  emptyWeightKg: 0,
                  maxWeightKg: 0,
                  active: true,
                })
              }
              className="btn-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider"
            >
              + Nova Embalagem DHL
            </button>
          </div>

          <div className="border border-border rounded-sm overflow-hidden bg-background">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface border-b border-border uppercase font-semibold text-muted tracking-wider">
                <tr>
                  <th className="p-3">Código</th>
                  <th className="p-3">Nome da Embalagem</th>
                  <th className="p-3">Medidas (C x L x A cm)</th>
                  <th className="p-3">Peso Vazio (kg)</th>
                  <th className="p-3">Peso Máx (kg)</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {types.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-muted">
                      Nenhuma embalagem cadastrada.
                    </td>
                  </tr>
                ) : (
                  types.map((t) => {
                    const hasZeroDims = t.lengthCm === 0 || t.widthCm === 0 || t.heightCm === 0;
                    return (
                      <tr key={t.id} className="hover:bg-surface/50 transition-colors">
                        <td className="p-3 font-mono font-bold text-accent">{t.code}</td>
                        <td className="p-3 font-medium">{t.name}</td>
                        <td className="p-3">
                          {hasZeroDims ? (
                            <span className="text-foreground underline decoration-2 font-semibold">
                              ⚠️ {t.lengthCm} × {t.widthCm} × {t.heightCm} cm (Pendente)
                            </span>
                          ) : (
                            <span>
                              {t.lengthCm} × {t.widthCm} × {t.heightCm} cm
                            </span>
                          )}
                        </td>
                        <td className="p-3">{t.emptyWeightKg.toFixed(2)} kg</td>
                        <td className="p-3">{t.maxWeightKg.toFixed(2)} kg</td>
                        <td className="p-3">
                          <button
                            onClick={() => togglePackagingType(t.id, !t.active)}
                            className={`px-2.5 py-0.5 rounded text-[10px] font-semibold border ${
                              t.active
                                ? "bg-foreground text-background border-foreground"
                                : "bg-surface text-muted border-border"
                            }`}
                          >
                            {t.active ? "Ativo" : "Inativo"}
                          </button>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => setEditingType(t)}
                            className="text-accent underline font-medium hover:opacity-80"
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: REGRAS DE CAPACIDADE */}
      {tab === "rules" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted">
              Defina a quantidade mínima e máxima de peças por categoria que cada embalagem comporta.
            </p>
            <button
              onClick={() =>
                setEditingRule({
                  category: "Dresses",
                  packagingTypeId: types[0]?.id ?? "",
                  minQuantity: 1,
                  maxQuantity: 20,
                  active: true,
                })
              }
              className="btn-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider"
            >
              + Nova Regra de Capacidade
            </button>
          </div>

          <div className="border border-border rounded-sm overflow-hidden bg-background">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface border-b border-border uppercase font-semibold text-muted tracking-wider">
                <tr>
                  <th className="p-3">Categoria</th>
                  <th className="p-3">Embalagem DHL</th>
                  <th className="p-3">Intervalo de Peças</th>
                  <th className="p-3">Capacidade Máxima</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-muted">
                      Nenhuma regra cadastrada.
                    </td>
                  </tr>
                ) : (
                  rules.map((r) => (
                    <tr key={r.id} className="hover:bg-surface/50 transition-colors">
                      <td className="p-3 font-semibold">{r.category}</td>
                      <td className="p-3 font-medium">
                        <span className="font-mono text-accent">{r.packagingTypeCode}</span> (
                        {r.packagingTypeName})
                      </td>
                      <td className="p-3">
                        {r.minQuantity} a {r.maxQuantity} peças
                      </td>
                      <td className="p-3 font-bold">{r.maxQuantity} peças</td>
                      <td className="p-3">
                        <button
                          onClick={() => toggleCapacityRule(r.id, !r.active)}
                          className={`px-2.5 py-0.5 rounded text-[10px] font-semibold border ${
                            r.active
                              ? "bg-foreground text-background border-foreground"
                              : "bg-surface text-muted border-border"
                          }`}
                        >
                          {r.active ? "Ativo" : "Inativo"}
                        </button>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => setEditingRule(r)}
                          className="text-accent underline font-medium hover:opacity-80"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL EDIT TYPE */}
      {editingType && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background max-w-md w-full p-6 rounded-sm border border-border shadow-xl space-y-4">
            <h3 className="font-serif text-lg font-bold">
              {editingType.id ? "Editar Embalagem DHL" : "Nova Embalagem DHL"}
            </h3>

            <form onSubmit={handleSaveTypeSubmit} className="space-y-3 text-xs">
              {editingType.id && <input type="hidden" name="id" value={editingType.id} />}

              <div>
                <label className="block text-muted uppercase tracking-wider mb-1 font-semibold">
                  Código DHL (Ex: DHL_BOX_8)
                </label>
                <input
                  type="text"
                  name="code"
                  defaultValue={editingType.code ?? ""}
                  required
                  className="w-full border border-border px-3 py-2 uppercase font-mono bg-surface"
                />
              </div>

              <div>
                <label className="block text-muted uppercase tracking-wider mb-1 font-semibold">
                  Nome (Ex: DHL Box 8)
                </label>
                <input
                  type="text"
                  name="name"
                  defaultValue={editingType.name ?? ""}
                  required
                  className="w-full border border-border px-3 py-2 bg-surface"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-muted uppercase tracking-wider mb-1 font-semibold">
                    Comprimento (cm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="length_cm"
                    defaultValue={editingType.lengthCm ?? 0}
                    className="w-full border border-border px-3 py-2 bg-surface"
                  />
                </div>
                <div>
                  <label className="block text-muted uppercase tracking-wider mb-1 font-semibold">
                    Largura (cm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="width_cm"
                    defaultValue={editingType.widthCm ?? 0}
                    className="w-full border border-border px-3 py-2 bg-surface"
                  />
                </div>
                <div>
                  <label className="block text-muted uppercase tracking-wider mb-1 font-semibold">
                    Altura (cm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="height_cm"
                    defaultValue={editingType.heightCm ?? 0}
                    className="w-full border border-border px-3 py-2 bg-surface"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted uppercase tracking-wider mb-1 font-semibold">
                    Peso Vazio (kg)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    name="empty_weight_kg"
                    defaultValue={editingType.emptyWeightKg ?? 0}
                    className="w-full border border-border px-3 py-2 bg-surface"
                  />
                </div>
                <div>
                  <label className="block text-muted uppercase tracking-wider mb-1 font-semibold">
                    Peso Máximo (kg)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    name="max_weight_kg"
                    defaultValue={editingType.maxWeightKg ?? 0}
                    className="w-full border border-border px-3 py-2 bg-surface"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="activeType"
                  name="active"
                  defaultChecked={editingType.active ?? true}
                  className="accent-accent"
                />
                <label htmlFor="activeType" className="font-semibold cursor-pointer">
                  Embalagem Ativa
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setEditingType(null)}
                  className="px-4 py-2 border border-border hover:bg-surface font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary px-5 py-2 font-semibold uppercase tracking-wider"
                >
                  {loading ? "Salvando..." : "Salvar Embalagem"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDIT RULE */}
      {editingRule && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background max-w-md w-full p-6 rounded-sm border border-border shadow-xl space-y-4">
            <h3 className="font-serif text-lg font-bold">
              {editingRule.id ? "Editar Regra de Capacidade" : "Nova Regra de Capacidade"}
            </h3>

            <form onSubmit={handleSaveRuleSubmit} className="space-y-3 text-xs">
              {editingRule.id && <input type="hidden" name="id" value={editingRule.id} />}

              <div>
                <label className="block text-muted uppercase tracking-wider mb-1 font-semibold">
                  Categoria do Produto (Ex: Dresses, Vestidos)
                </label>
                <input
                  type="text"
                  name="category"
                  defaultValue={editingRule.category ?? "Dresses"}
                  required
                  className="w-full border border-border px-3 py-2 bg-surface"
                />
              </div>

              <div>
                <label className="block text-muted uppercase tracking-wider mb-1 font-semibold">
                  Embalagem DHL
                </label>
                <select
                  name="packaging_type_id"
                  defaultValue={editingRule.packagingTypeId ?? types[0]?.id}
                  required
                  className="w-full border border-border px-3 py-2 bg-surface font-mono"
                >
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted uppercase tracking-wider mb-1 font-semibold">
                    Qtd Mínima (Peças)
                  </label>
                  <input
                    type="number"
                    min="1"
                    name="min_quantity"
                    defaultValue={editingRule.minQuantity ?? 1}
                    required
                    className="w-full border border-border px-3 py-2 bg-surface"
                  />
                </div>
                <div>
                  <label className="block text-muted uppercase tracking-wider mb-1 font-semibold">
                    Qtd Máxima (Peças)
                  </label>
                  <input
                    type="number"
                    min="1"
                    name="max_quantity"
                    defaultValue={editingRule.maxQuantity ?? 20}
                    required
                    className="w-full border border-border px-3 py-2 bg-surface"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="activeRule"
                  name="active"
                  defaultChecked={editingRule.active ?? true}
                  className="accent-accent"
                />
                <label htmlFor="activeRule" className="font-semibold cursor-pointer">
                  Regra Ativa
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setEditingRule(null)}
                  className="px-4 py-2 border border-border hover:bg-surface font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary px-5 py-2 font-semibold uppercase tracking-wider"
                >
                  {loading ? "Salvando..." : "Salvar Regra"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
