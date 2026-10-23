"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  updateProduct,
  setProductStatus,
  setProductFeatured,
  deleteProducts,
  type UpdateProductInput,
} from "@/app/admin/produtos/actions";

interface ConnectorRow {
  id: string;
  supplier_name: string;
  status: string;
  included_in_contract: boolean;
}

interface ProductRow {
  id: string;
  title: string;
  title_en: string | null;
  title_es: string | null;
  category: string | null;
  status: string;
  is_featured: boolean;
  connector_id: string | null;
  original_price: number;
  markup: number;
  price_brl: number | null;
  price_usd: number | null;
  price_eur: number | null;
  hs_code: string | null;
  weight_g: number | null;
  dims_cm: { length?: number; width?: number; height?: number } | null;
  sizes: string[];
  colors: string[];
  default_stock: number;
}

export function ProductEditForm({
  product,
  connectors = [],
  initialConnectorIds = [],
}: {
  product: ProductRow;
  connectors?: ConnectorRow[];
  initialConnectorIds?: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const failed = (res: unknown) => {
    const msg = res && typeof res === "object" && "error" in res ? (res as { error?: string }).error : undefined;
    if (msg) setActionError(msg);
    return Boolean(msg);
  };
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedConnectorIds, setSelectedConnectorIds] = useState<string[]>(initialConnectorIds);

  const [form, setForm] = useState({
    title: product.title,
    titleEn: product.title_en ?? "",
    titleEs: product.title_es ?? "",
    category: product.category ?? "",
    originalPrice: product.original_price,
    markup: product.markup,
    hsCode: product.hs_code ?? "",
    weightG: product.weight_g ?? "",
    length: product.dims_cm?.length ?? "",
    width: product.dims_cm?.width ?? "",
    height: product.dims_cm?.height ?? "",
    sizesText: product.sizes.join(", "),
    colorsText: product.colors.join(", "),
    defaultStock: product.default_stock,
  });

  function toggleConnector(id: string) {
    setSelectedConnectorIds((prev) =>
      prev.includes(id) ? prev.filter((cid) => cid !== id) : [...prev, id]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    const input: UpdateProductInput = {
      title: form.title,
      titleEn: form.titleEn,
      titleEs: form.titleEs,
      category: form.category,
      connectorId: selectedConnectorIds[0] ?? null,
      connectorIds: selectedConnectorIds,
      originalPrice: Number(form.originalPrice),
      markup: Number(form.markup),
      hsCode: form.hsCode,
      weightG: form.weightG === "" ? null : Number(form.weightG),
      dimsCm: {
        length: form.length === "" ? null : Number(form.length),
        width: form.width === "" ? null : Number(form.width),
        height: form.height === "" ? null : Number(form.height),
      },
      sizes: form.sizesText.split(",").map((s) => s.trim()).filter(Boolean),
      colors: form.colorsText.split(",").map((c) => c.trim()).filter(Boolean),
      defaultStock: Number(form.defaultStock),
    };
    startTransition(async () => {
      setActionError(null);
      if (failed(await updateProduct(product.id, input))) return;
      setSaved(true);
      router.refresh();
    });
  }

  function changeStatus(status: "draft" | "published" | "archived") {
    startTransition(async () => {
      setActionError(null);
      if (failed(await setProductStatus([product.id], status))) return;
      router.refresh();
    });
  }

  function toggleFeatured() {
    startTransition(async () => {
      setActionError(null);
      if (failed(await setProductFeatured(product.id, !product.is_featured))) return;
      router.refresh();
    });
  }

  function handleDelete() {
    setConfirmDelete(true);
  }

  function runConfirmedDelete() {
    setConfirmDelete(false);
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteProducts([product.id]);
      if ("error" in result) {
        setDeleteError(result.error);
        return;
      }
      if (result.blockedCount > 0) {
        setDeleteError("Não é possível excluir — este produto já tem pedidos. Arquive-o em vez disso.");
      } else {
        router.push("/admin/produtos");
      }
    });
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-2 mb-2">
        <StatusButton
          label="Rascunho"
          active={product.status === "draft"}
          onClick={() => changeStatus("draft")}
          disabled={pending}
        />
        <StatusButton
          label="Publicado"
          active={product.status === "published"}
          onClick={() => changeStatus("published")}
          disabled={pending}
        />
        <StatusButton
          label="Arquivado"
          active={product.status === "archived"}
          onClick={() => changeStatus("archived")}
          disabled={pending}
        />
        <button
          type="button"
          disabled={pending}
          onClick={handleDelete}
          className="ml-auto text-xs border border-red-600 text-red-600 px-3 py-1.5 disabled:opacity-50"
        >
          Excluir produto
        </button>
      </div>
      {deleteError && <p className="text-xs text-red-600 mb-4">{deleteError}</p>}
      {actionError && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4" role="alert">
          {actionError}
        </p>
      )}
      <label className="flex items-center gap-2 text-xs text-muted mb-6">
        <input
          type="checkbox"
          checked={product.is_featured}
          disabled={pending}
          onChange={toggleFeatured}
        />
        Destaque (aparece na seção &quot;Destaques&quot; da home)
      </label>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Título (PT)">
          <input
            required
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full border border-border px-3 py-2 text-sm"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Título (EN)">
            <input
              value={form.titleEn}
              onChange={(e) => setForm((f) => ({ ...f, titleEn: e.target.value }))}
              className="w-full border border-border px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Título (ES)">
            <input
              value={form.titleEs}
              onChange={(e) => setForm((f) => ({ ...f, titleEs: e.target.value }))}
              className="w-full border border-border px-3 py-2 text-sm"
            />
          </Field>
        </div>

        <Field label="Categoria">
          <input
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="w-full border border-border px-3 py-2 text-sm"
          />
        </Field>

        <div>
          <span className="block text-sm mb-1 font-medium">Fornecedor(es) / Conectores vinculados</span>
          {connectors.length === 0 ? (
            <p className="text-xs text-muted">Nenhum conector cadastrado ainda.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 border border-border rounded-sm p-3">
              {connectors.map((c) => {
                const isSelected = selectedConnectorIds.includes(c.id);
                return (
                  <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleConnector(c.id)}
                    />
                    <span className={isSelected ? "font-semibold text-accent" : "text-muted"}>
                      {c.supplier_name}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Custo da peça (R$, recebido do fornecedor)">
            <input
              type="number"
              step="0.01"
              value={form.originalPrice}
              onChange={(e) => setForm((f) => ({ ...f, originalPrice: Number(e.target.value) }))}
              className="w-full border border-border px-3 py-2 text-sm"
            />
          </Field>
        </div>
        <p className="text-xs text-muted -mt-2">
          O preço de venda é calculado automaticamente a partir deste custo e das regras em{" "}
          <Link href="/admin/precificacao" className="underline">
            Precificação
          </Link>{" "}
          (veja “Preço calculado” abaixo). Atual: {product.price_brl ?? "—"} BRL / {product.price_usd ?? "—"} USD / {product.price_eur ?? "—"} EUR.
        </p>

        <Field label="Tamanhos (separados por vírgula, como recebidos do fornecedor)">
          <input
            value={form.sizesText}
            onChange={(e) => setForm((f) => ({ ...f, sizesText: e.target.value }))}
            placeholder="38, 40, 42, 44"
            className="w-full border border-border px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Cores (separadas por vírgula, como recebidas do fornecedor)">
          <input
            value={form.colorsText}
            onChange={(e) => setForm((f) => ({ ...f, colorsText: e.target.value }))}
            placeholder="Marsala, Azul Marinho, Verde"
            className="w-full border border-border px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Estoque padrão por nova combinação tamanho/cor">
          <input
            type="number"
            min={0}
            value={form.defaultStock}
            onChange={(e) => setForm((f) => ({ ...f, defaultStock: Number(e.target.value) }))}
            className="w-full border border-border px-3 py-2 text-sm"
          />
        </Field>
        <p className="text-xs text-muted -mt-2">
          Salvar regenera a matriz tamanho×cor abaixo — combinações existentes
          e seus estoques não são alterados, apenas as novas são
          adicionadas.
        </p>

        <Field label="HS code">
          <input
            value={form.hsCode}
            onChange={(e) => setForm((f) => ({ ...f, hsCode: e.target.value }))}
            className="w-full border border-border px-3 py-2 text-sm"
            placeholder="ex.: 6204.44"
          />
        </Field>

        <div className="grid grid-cols-4 gap-4">
          <Field label="Peso (g)">
            <input
              type="number"
              value={form.weightG}
              onChange={(e) => setForm((f) => ({ ...f, weightG: e.target.value }))}
              className="w-full border border-border px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Comprimento (cm)">
            <input
              type="number"
              value={form.length}
              onChange={(e) => setForm((f) => ({ ...f, length: e.target.value }))}
              className="w-full border border-border px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Largura (cm)">
            <input
              type="number"
              value={form.width}
              onChange={(e) => setForm((f) => ({ ...f, width: e.target.value }))}
              className="w-full border border-border px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Altura (cm)">
            <input
              type="number"
              value={form.height}
              onChange={(e) => setForm((f) => ({ ...f, height: e.target.value }))}
              className="w-full border border-border px-3 py-2 text-sm"
            />
          </Field>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="btn-primary px-4 py-2 text-sm uppercase tracking-wide"
          >
            {pending ? "Salvando..." : "Salvar"}
          </button>
          {saved && !pending && <span className="text-xs text-muted">Salvo.</span>}
        </div>
      </form>

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background max-w-md w-full p-6 rounded-sm border border-border shadow-xl space-y-4">
            <h3 className="font-serif text-lg font-bold">Excluir permanentemente?</h3>
            <p className="text-sm text-muted">
              Excluir &quot;{product.title}&quot; permanentemente? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-xs border border-border px-3 py-1.5"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={runConfirmedDelete}
                className="text-xs border border-red-600 text-red-600 px-3 py-1.5 disabled:opacity-50"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm mb-1">{label}</span>
      {children}
    </label>
  );
}

function StatusButton({
  label,
  active,
  onClick,
  disabled,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || active}
      className={`text-xs px-3 py-1.5 border ${
        active ? "bg-accent text-white border-accent" : "border-border disabled:opacity-50"
      }`}
    >
      {label}
    </button>
  );
}
