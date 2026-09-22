"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCurrency } from "@/components/currency-provider";
import { useCart } from "@/components/cart-provider";
import { formatPicked } from "@/lib/currency";
import type { ProductDetail } from "@/lib/catalog";

/**
 * Sizes/colors come as flat lists (products.sizes/colors); which
 * size+color combinations actually exist — and their stock — comes from
 * the generated `variants` matrix. A combo with no matching variant row
 * is never selectable (per spec: never show as available something that
 * isn't in the matrix).
 */
export function ProductPurchasePanel({ product }: { product: ProductDetail }) {
  const t = useTranslations("product");
  const { currency } = useCurrency();
  const { addItem } = useCart();
  const router = useRouter();
  const [added, setAdded] = useState(false);

  const variantIndex = useMemo(() => {
    const map = new Map<string, (typeof product.variants)[number]>();
    for (const v of product.variants) {
      const key = `${(v.size ?? "").trim().toLowerCase()}::${(v.color ?? "").trim().toLowerCase()}`;
      map.set(key, v);
    }
    return map;
  }, [product]);

  // Find initial size and color with stock > 0 if available
  const initialVariant = useMemo(() => {
    return product.variants.find((v) => Number(v.stock ?? 0) > 0) ?? product.variants[0];
  }, [product]);

  const [size, setSize] = useState<string | null>(
    initialVariant?.size ?? product.sizes[0] ?? null
  );
  const [color, setColor] = useState<string | null>(
    initialVariant?.color ?? product.colors[0] ?? null
  );

  function isComboAvailable(s: string | null, c: string | null): boolean {
    const cleanS = s ? s.trim().toLowerCase() : null;
    const cleanC = c ? c.trim().toLowerCase() : null;

    if (!cleanS && !cleanC) return false;

    if (cleanS && cleanC) {
      const v = variantIndex.get(`${cleanS}::${cleanC}`);
      return !!v && Number(v.stock ?? 0) > 0;
    }
    if (cleanS) {
      return product.variants.some(
        (v) => (v.size ?? "").trim().toLowerCase() === cleanS && Number(v.stock ?? 0) > 0
      );
    }
    if (cleanC) {
      return product.variants.some(
        (v) => (v.color ?? "").trim().toLowerCase() === cleanC && Number(v.stock ?? 0) > 0
      );
    }
    return false;
  }

  // Colors available for the currently selected size (out-of-stock colors for this size are hidden)
  const availableColors = useMemo(() => {
    if (!size) return product.colors;
    const filtered = product.colors.filter((c) => isComboAvailable(size, c));
    return filtered.length > 0 ? filtered : product.colors;
  }, [product.colors, size, isComboAvailable]);

  const selectedVariant = useMemo(() => {
    if (!size) return undefined;
    const key = `${size.trim().toLowerCase()}::${(color ?? "").trim().toLowerCase()}`;
    return variantIndex.get(key);
  }, [size, color, variantIndex]);

  const priceLabel = product.pricing ? formatPicked(product.pricing, currency) : null;

  const [quantity, setQuantity] = useState(1);

  function handleSizeSelect(newSize: string) {
    setSize(newSize);
    setAdded(false);
    setQuantity(1);
    // Switch to first available color for newSize if current color is not in available colors
    if (color && !isComboAvailable(newSize, color)) {
      const firstAvailableColor = product.colors.find((c) => isComboAvailable(newSize, c));
      if (firstAvailableColor) {
        setColor(firstAvailableColor);
      }
    }
  }

  function handleColorSelect(newColor: string) {
    setColor(newColor);
    setAdded(false);
    setQuantity(1);
    if (size && !isComboAvailable(size, newColor)) {
      const firstAvailableSize = product.sizes.find((s) => isComboAvailable(s, newColor));
      if (firstAvailableSize) {
        setSize(firstAvailableSize);
      }
    }
  }

  return (
    <div>
      {product.sizes.length > 0 && (
        <div className="mb-4">
          <p className="text-xs uppercase tracking-wide text-muted mb-2">{t("size")}</p>
          <div className="flex flex-wrap gap-2">
            {product.sizes.map((s) => {
              const available = isComboAvailable(s, null);
              const isSelected = s === size;
              const sampleVariant = product.variants.find((v) => v.size === s);
              const displayLabel =
                currency === "USD" && sampleVariant?.sizeUs
                  ? `${s} (US ${sampleVariant.sizeUs})`
                  : currency === "EUR" && sampleVariant?.sizeEu
                  ? `${s} (EU ${sampleVariant.sizeEu})`
                  : s;

              return (
                <button
                  key={s}
                  disabled={!available}
                  onClick={() => handleSizeSelect(s)}
                  className={`text-xs border px-3 py-1 font-medium transition-colors ${
                    isSelected
                      ? "border-accent text-accent bg-accent/5 font-semibold"
                      : "border-border hover:border-gray-400"
                  } ${!available ? "opacity-30 cursor-not-allowed line-through" : ""}`}
                >
                  {displayLabel}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {availableColors.length > 0 && (
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-muted mb-2">{t("color")}</p>
          <div className="flex flex-wrap gap-2">
            {availableColors.map((c) => {
              const isSelected = c === color;
              return (
                <button
                  key={c}
                  onClick={() => handleColorSelect(c)}
                  className={`text-xs border px-3 py-1 font-medium transition-colors ${
                    isSelected
                      ? "border-accent text-accent bg-accent/5 font-semibold"
                      : "border-border hover:border-gray-400"
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quantity Selector */}
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-muted mb-2">{t("quantity")}</p>
        <div className="flex items-center gap-3">
          <div className="flex items-center border border-border rounded-sm overflow-hidden bg-background">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="w-9 h-9 flex items-center justify-center text-sm font-semibold hover:bg-surface disabled:opacity-40 transition-colors"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              max={selectedVariant?.stock ?? 99}
              value={quantity}
              onChange={(e) => {
                const val = Math.max(1, Math.min(Number(e.target.value) || 1, selectedVariant?.stock ?? 99));
                setQuantity(val);
              }}
              className="w-12 h-9 text-center text-sm font-medium border-x border-border focus:outline-none bg-transparent"
            />
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(selectedVariant?.stock ?? 99, q + 1))}
              disabled={selectedVariant ? quantity >= selectedVariant.stock : false}
              className="w-9 h-9 flex items-center justify-center text-sm font-semibold hover:bg-surface disabled:opacity-40 transition-colors"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          {selectedVariant && (
            <span className="text-xs text-muted">
              ({selectedVariant.stock} {selectedVariant.stock === 1 ? "unidade em estoque" : "unidades em estoque"})
            </span>
          )}
        </div>
      </div>

      {priceLabel && (
        <div>
          <p className="text-2xl font-semibold mb-1">{priceLabel}</p>
          <p className="text-xs text-muted mb-4">{t("installmentsLabel")}</p>

          <button
            disabled={!selectedVariant || selectedVariant.stock === 0 || !product.pricing}
            onClick={() => {
              if (!selectedVariant || !product.pricing) return;
              addItem(
                {
                  variantId: selectedVariant.id,
                  productSlug: product.slug,
                  title: product.title,
                  color: selectedVariant.color,
                  size: selectedVariant.size,
                  pricing: product.pricing,
                },
                quantity
              );
              setAdded(true);
            }}
            className="w-full bg-accent text-white py-3 text-sm uppercase tracking-wide font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors"
          >
            {selectedVariant && selectedVariant.stock > 0
              ? `${t("buy")} (${quantity})`
              : t("selectVariant")}
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
      )}
    </div>
  );
}
