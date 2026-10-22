"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCurrency } from "@/components/currency-provider";
import { useCart } from "@/components/cart-provider";
import { formatCurrency, pickPrice } from "@/lib/currency";
import type { ProductDetail } from "@/lib/catalog";
import type { Variant } from "@/lib/types";
import { swatchHex } from "@/lib/color-swatch";

/**
 * Grid selector: rows = colors, columns = sizes. Each cell maps 1:1 to a row
 * in `variants` (the size x color matrix generated in the DB — migration
 * 0005). A cell with no matching variant, or stock 0, renders as a blocked
 * (disabled) square; otherwise it's a "+" that turns into a qty stepper
 * capped at that variant's stock. Multiple cells can hold a qty at once —
 * "Adicionar ao carrinho" adds every selected variant/qty pair in one go.
 */
export function ProductPurchasePanel({ product }: { product: ProductDetail }) {
  const t = useTranslations("product");
  const { currency } = useCurrency();
  const { addItem } = useCart();
  const router = useRouter();
  const [added, setAdded] = useState(false);
  const [selections, setSelections] = useState<Record<string, number>>({});

  const variantByKey = useMemo(() => {
    const map = new Map<string, Variant>();
    for (const v of product.variants) {
      map.set(`${(v.size ?? "").trim().toLowerCase()}::${(v.color ?? "").trim().toLowerCase()}`, v);
    }
    return map;
  }, [product.variants]);

  const variantById = useMemo(() => {
    const map = new Map<string, Variant>();
    for (const v of product.variants) map.set(v.id, v);
    return map;
  }, [product.variants]);

  const sizeLabel = useMemo(() => {
    const cache = new Map<string, string>();
    for (const s of product.sizes) {
      const sample = product.variants.find((v) => v.size === s);
      cache.set(
        s,
        currency === "USD" && sample?.sizeUs
          ? `${s} (US ${sample.sizeUs})`
          : currency === "EUR" && sample?.sizeEu
          ? `${s} (EU ${sample.sizeEu})`
          : s
      );
    }
    return cache;
  }, [product.sizes, product.variants, currency]);

  const picked = product.pricing ? pickPrice(product.pricing, currency) : null;

  function setCellQty(variant: Variant, qty: number) {
    // Supplier stock is never exposed to the buyer: the TDP confirms every item before payment.
    const clamped = Math.max(0, Math.min(qty, 999));
    setAdded(false);
    setSelections((prev) => {
      const next = { ...prev };
      if (clamped <= 0) delete next[variant.id];
      else next[variant.id] = clamped;
      return next;
    });
  }

  const totalQty = Object.values(selections).reduce((sum, q) => sum + q, 0);
  const totalPrice = picked ? picked.amount * totalQty : 0;

  function handleAddToCart() {
    if (!picked || totalQty === 0) return;
    for (const [variantId, qty] of Object.entries(selections)) {
      const variant = variantById.get(variantId);
      if (!variant || qty <= 0) continue;
      addItem(
        {
          variantId: variant.id,
          productSlug: product.slug,
          title: product.title,
          color: variant.color,
          size: variant.size,
          pricing: product.pricing!,
        },
        qty
      );
    }
    setSelections({});
    setAdded(true);
  }

  if (!picked) return null;

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted mb-1">{t("wholesalePrice")}</p>
      <p className="text-2xl font-semibold mb-6">{formatCurrency(picked.amount, picked.currency)}</p>

      {product.sizes.length > 0 && product.colors.length > 0 && (
        <div className="mb-6">
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-xs uppercase tracking-wide text-muted">{t("size")} / {t("color")}</p>
            <p className="text-xs text-muted">{t("chooseVariants")}</p>
          </div>

          <div className="overflow-x-auto border border-border">
            <table className="border-collapse text-sm w-full">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-background text-left text-xs font-medium text-muted px-3 py-2 border-b border-border" />
                  {product.sizes.map((s) => (
                    <th
                      key={s}
                      className="text-xs font-medium text-muted px-2 py-2 border-b border-l border-border whitespace-nowrap"
                    >
                      {sizeLabel.get(s)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {product.colors.map((c) => (
                  <tr key={c}>
                    <td className="sticky left-0 bg-background px-3 py-2 border-t border-border whitespace-nowrap">
                      <span className="inline-flex items-center gap-2 text-xs font-medium">
                        <span
                          className="inline-block w-4 h-4 rounded-full border border-border/70 shrink-0"
                          style={{ backgroundColor: swatchHex(c) }}
                          aria-hidden
                        />
                        {c}
                      </span>
                    </td>
                    {product.sizes.map((s) => {
                      const variant = variantByKey.get(`${s.trim().toLowerCase()}::${c.trim().toLowerCase()}`);
                      const available = !!variant && variant.stock > 0;
                      const qty = variant ? selections[variant.id] ?? 0 : 0;

                      return (
                        <td key={s} className="border-t border-l border-border p-1 text-center">
                          {!available ? (
                            <div
                              className="w-10 h-9 mx-auto bg-surface/70"
                              aria-hidden
                              title={t("outOfStock")}
                            />
                          ) : qty === 0 ? (
                            <button
                              type="button"
                              onClick={() => setCellQty(variant!, 1)}
                              className="w-10 h-9 mx-auto flex items-center justify-center border border-border hover:border-accent hover:text-accent text-sm font-medium transition-colors"
                              aria-label={`${s} / ${c}`}
                            >
                              +
                            </button>
                          ) : (
                            <div className="w-10 h-9 mx-auto flex items-center justify-between border border-accent bg-accent/5 px-1">
                              <button
                                type="button"
                                onClick={() => setCellQty(variant!, qty - 1)}
                                className="w-4 h-full text-xs font-semibold text-accent"
                                aria-label="-"
                              >
                                −
                              </button>
                              <span className="text-xs font-semibold text-accent w-3 text-center">{qty}</span>
                              <button
                                type="button"
                                onClick={() => setCellQty(variant!, qty + 1)}
                                disabled={qty >= 999}
                                className="w-4 h-full text-xs font-semibold text-accent disabled:opacity-30"
                                aria-label="+"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3 text-sm">
        <span className="text-muted">
          {totalQty} {totalQty === 1 ? t("piece") : t("pieces")}
        </span>
        {totalQty > 0 && <span className="font-semibold">{formatCurrency(totalPrice, picked.currency)}</span>}
      </div>

      <button
        disabled={totalQty === 0}
        onClick={handleAddToCart}
        className="btn-primary w-full py-3 text-sm uppercase tracking-wide font-medium"
      >
        {totalQty > 0 ? `${t("buy")} (${totalQty})` : t("selectVariant")}
      </button>

      {added && (
        <p className="text-xs text-muted mt-2">
          {t("addedToCart")}{" "}
          <button onClick={() => router.push("/carrinho")} className="text-accent underline font-medium">
            {t("viewCart")}
          </button>
        </p>
      )}
    </div>
  );
}
