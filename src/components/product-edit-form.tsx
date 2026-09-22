"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  updateProduct,
  setProductStatus,
  setProductFeatured,
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

  const brlPreview =
    Math.round((Number(form.originalPrice || 0) + Number(form.markup || 0)) * 100) / 100;

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
      await updateProduct(product.id, input);
      setSaved(true);
      router.refresh();
    });
  }

  function changeStatus(status: "draft" | "published" | "archived") {
    startTransition(async () => {
      await setProductStatus([product.id], status);
      router.refresh();
    });
  }

  function toggleFeatured() {
    startTransition(async () => {
      await setProductFeatured(product.id, !product.is_featured);
      router.refresh();
    });
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-2 mb-2">
        <StatusButton
          label="Draft"
          active={product.status === "draft"}
          onClick={() => changeStatus("draft")}
          disabled={pending}
        />
        <StatusButton
          label="Published"
          active={product.status === "published"}
          onClick={() => changeStatus("published")}
          disabled={pending}
        />
        <StatusButton
          label="Archived"
          active={product.status === "archived"}
          onClick={() => changeStatus("archived")}
          disabled={pending}
        />
      </div>
      <label className="flex items-center gap-2 text-xs text-muted mb-6">
        <input
          type="checkbox"
          checked={product.is_featured}
          disabled={pending}
          onChange={toggleFeatured}
        />
        Featured (shows in the &quot;Destaques&quot; home section)
      </label>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Title (PT)">
          <input
            required
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full border border-border px-3 py-2 text-sm"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Title (EN)">
            <input
              value={form.titleEn}
              onChange={(e) => setForm((f) => ({ ...f, titleEn: e.target.value }))}
              className="w-full border border-border px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Title (ES)">
            <input
              value={form.titleEs}
              onChange={(e) => setForm((f) => ({ ...f, titleEs: e.target.value }))}
              className="w-full border border-border px-3 py-2 text-sm"
            />
          </Field>
        </div>

        <Field label="Category">
          <input
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="w-full border border-border px-3 py-2 text-sm"
          />
        </Field>

        <div>
          <span className="block text-sm mb-1 font-medium">Linked Supplier(s) / Connectors</span>
          {connectors.length === 0 ? (
            <p className="text-xs text-muted">No connectors registered yet.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 border border-border p-3">
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
          <Field label="Original price (BRL, as received from supplier)">
            <input
              type="number"
              step="0.01"
              value={form.originalPrice}
              onChange={(e) => setForm((f) => ({ ...f, originalPrice: Number(e.target.value) }))}
              className="w-full border border-border px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Markup (BRL, flat amount added)">
            <input
              type="number"
              step="0.01"
              value={form.markup}
              onChange={(e) => setForm((f) => ({ ...f, markup: Number(e.target.value) }))}
              className="w-full border border-border px-3 py-2 text-sm"
            />
          </Field>
        </div>
        <p className="text-xs text-muted -mt-2">
          BRL preview: {brlPreview} — USD/EUR are recalculated on save from
          the rate saved in{" "}
          <Link href="/admin/cambio" className="underline">
            /admin/cambio
          </Link>
          . Current: {product.price_brl ?? "—"} BRL / {product.price_usd ?? "—"} USD /{" "}
          {product.price_eur ?? "—"} EUR.
        </p>

        <Field label="Sizes (comma-separated, as received from supplier)">
          <input
            value={form.sizesText}
            onChange={(e) => setForm((f) => ({ ...f, sizesText: e.target.value }))}
            placeholder="38, 40, 42, 44"
            className="w-full border border-border px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Colors (comma-separated, as received from supplier)">
          <input
            value={form.colorsText}
            onChange={(e) => setForm((f) => ({ ...f, colorsText: e.target.value }))}
            placeholder="Marsala, Azul Marinho, Verde"
            className="w-full border border-border px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Default stock per new size/color combination">
          <input
            type="number"
            min={0}
            value={form.defaultStock}
            onChange={(e) => setForm((f) => ({ ...f, defaultStock: Number(e.target.value) }))}
            className="w-full border border-border px-3 py-2 text-sm"
          />
        </Field>
        <p className="text-xs text-muted -mt-2">
          Saving regenerates the size×color matrix below — existing
          combinations and their stock aren&apos;t touched, only new ones are
          added.
        </p>

        <Field label="HS code">
          <input
            value={form.hsCode}
            onChange={(e) => setForm((f) => ({ ...f, hsCode: e.target.value }))}
            className="w-full border border-border px-3 py-2 text-sm"
            placeholder="e.g. 6204.44"
          />
        </Field>

        <div className="grid grid-cols-4 gap-4">
          <Field label="Weight (g)">
            <input
              type="number"
              value={form.weightG}
              onChange={(e) => setForm((f) => ({ ...f, weightG: e.target.value }))}
              className="w-full border border-border px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Length (cm)">
            <input
              type="number"
              value={form.length}
              onChange={(e) => setForm((f) => ({ ...f, length: e.target.value }))}
              className="w-full border border-border px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Width (cm)">
            <input
              type="number"
              value={form.width}
              onChange={(e) => setForm((f) => ({ ...f, width: e.target.value }))}
              className="w-full border border-border px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Height (cm)">
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
            className="bg-accent text-white px-4 py-2 text-sm uppercase tracking-wide disabled:opacity-50"
          >
            {pending ? "Saving..." : "Save"}
          </button>
          {saved && !pending && <span className="text-xs text-muted">Saved.</span>}
        </div>
      </form>
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
