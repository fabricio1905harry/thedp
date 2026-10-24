"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCurrency } from "@/components/currency-provider";
import { useCart } from "@/components/cart-provider";
import { formatCurrency, pickPrice } from "@/lib/currency";
import type { ProductDetail } from "@/lib/catalog";
import type { Variant } from "@/lib/types";
import { swatchHex } from "@/lib/color-swatch";
import { formatSize, type SizeChartRow } from "@/lib/size-format";
import { cancelNotify, requestNotify } from "@/lib/buyer-actions";
import { SizeGuideButton } from "@/components/size-guide";

/**
 * Grid selector: rows = colors, columns = sizes. Each cell maps 1:1 to a row
 * in `variants` (the size x color matrix generated in the DB — migration
 * 0005). A cell with no matching variant, or stock 0, renders as a blocked
 * (disabled) square; otherwise it's a "+" that turns into a qty stepper
 * capped at that variant's stock. Multiple cells can hold a qty at once —
 * "Adicionar ao carrinho" adds every selected variant/qty pair in one go.
 */
export function ProductPurchasePanel({
  product,
  sizeChart = [],
  notifyRequested = [],
}: {
  product: ProductDetail;
  sizeChart?: SizeChartRow[];
  /** Variant ids the buyer already asked to be notified about. */
  notifyRequested?: string[];
}) {
  const t = useTranslations("product");
  const tn = useTranslations("c2.notify");
  const locale = useLocale();
  const [notifying, setNotifying] = useState<Set<string>>(new Set(notifyRequested));
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);
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
    for (const s of product.sizes) cache.set(s, formatSize(s, product.sizeInfo[s], locale, currency));
    return cache;
  }, [product.sizes, product.sizeInfo, currency, locale]);

  async function toggleNotify(variant: Variant) {
    setNotifyMsg(null);
    const on = notifying.has(variant.id);
    const res = on ? await cancelNotify(variant.id) : await requestNotify(variant.id);
    if (res.error) {
      setNotifyMsg(tn(res.error === "approval" ? "approval" : res.error === "login" ? "login" : res.error === "available" ? "available" : "failed"));
      return;
    }
    setNotifying((prev) => {
      const next = new Set(prev);
      if (on) next.delete(variant.id);
      else next.add(variant.id);
      return next;
    });
    setNotifyMsg(on ? tn("cancelled") : tn("requested"));
  }

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
          imageUrl: product.images[0] ?? product.imageUrl ?? null,
          imageCrop: product.imageCrops[0] ?? null,
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
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted">{t("chooseVariants")}</p>
              <SizeGuideButton chart={sizeChart} />
            </div>
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
                          style={{ backgroundColor: product.colorHex[c] ?? swatchHex(c) }}
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
                          {!available && variant ? (
                            <button
                              type="button"
                              onClick={() => toggleNotify(variant)}
                              className={`w-10 h-9 mx-auto flex items-center justify-center border text-muted transition-colors ${
                                notifying.has(variant.id) ? "border-accent text-accent bg-accent/5" : "border-dashed border-border hover:border-accent hover:text-accent bg-surface/70"
                              }`}
                              title={notifying.has(variant.id) ? tn("waiting") : `${t("outOfStock")} — ${tn("notifyMe")}`}
                              aria-label={`${s} / ${c}: ${notifying.has(variant.id) ? tn("waiting") : tn("notifyMe")}`}
                              aria-pressed={notifying.has(variant.id)}
                            >
                              <svg viewBox="0 0 24 24" className="w-4 h-4" fill={notifying.has(variant.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.6} aria-hidden>
                                <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
                                <path d="M10 19a2 2 0 0 0 4 0" />
                              </svg>
                            </button>
                          ) : !available ? (
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
          {notifyMsg ? (
            <p className="mt-2 text-xs text-muted" role="status">{notifyMsg}</p>
          ) : (
            <p className="mt-2 text-[11px] text-muted">{tn("hint")}</p>
          )}
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
