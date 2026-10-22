import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/currency";

export interface CompareItem {
  id: string;
  title: string;
  color: string | null;
  size: string | null;
  qty: number;
  unit_price: number;
  item_status: string;
  original_qty: number | null;
  original_unit_price: number | null;
  added_by_tdp: boolean;
}

export interface CompareTotals {
  currency: string;
  originalSubtotal: number | null;
  subtotal: number;
  chargesInformed: boolean;
  shipping: number;
  duties: number;
  other: number;
  total: number;
}

const ACTIVE = new Set(["available", "requested"]);

/**
 * Original Request × Confirmed Order, side by side. The Original Request is
 * what the buyer asked for (frozen in migration 0030); the Confirmed Order is
 * the current state after the availability check. Differences are highlighted.
 */
export function OriginalVsConfirmed({ items, totals }: { items: CompareItem[]; totals: CompareTotals }) {
  const t = useTranslations("commercial");
  const money = (v: number) => formatCurrency(v, totals.currency);

  const rows = items.map((item) => {
    const hadOriginal = item.original_qty !== null && !item.added_by_tdp;
    const inactive = !ACTIVE.has(item.item_status);
    const origQty = hadOriginal ? Number(item.original_qty) : null;
    const origPrice = hadOriginal ? Number(item.original_unit_price ?? item.unit_price) : null;
    const qtyChanged = hadOriginal && !inactive && origQty !== item.qty;
    const priceChanged = hadOriginal && !inactive && origPrice !== Number(item.unit_price);
    const kind: "same" | "changed" | "removed" | "added" = item.added_by_tdp
      ? "added"
      : inactive
        ? "removed"
        : qtyChanged || priceChanged
          ? "changed"
          : "same";
    return { item, origQty, origPrice, inactive, qtyChanged, priceChanged, kind };
  });

  const changedCount = rows.filter((r) => r.kind !== "same").length;
  const original = totals.originalSubtotal ?? 0;
  const diff = Math.round((totals.subtotal - original) * 100) / 100;

  const tone = {
    same: "",
    changed: "bg-amber-50",
    removed: "bg-red-50",
    added: "bg-emerald-50",
  } as const;

  return (
    <section className="bg-white border border-border/80 rounded-sm p-4 sm:p-6 space-y-4" aria-labelledby="compare-title">
      <div className="border-b border-border/60 pb-3 space-y-1">
        <h3 id="compare-title" className="text-xs uppercase tracking-[0.2em] font-semibold text-accent">
          {t("compare.title")}
        </h3>
        <p className="text-[11px] text-muted">
          {changedCount > 0 ? t("compare.differences", { count: changedCount }) : t("compare.noDifferences")}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-xs border-collapse">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted">
              <th className="py-2 pr-3 font-semibold">{t("compare.item")}</th>
              <th className="py-2 pr-3 font-semibold">{t("compare.original")}</th>
              <th className="py-2 font-semibold">{t("compare.confirmed")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map(({ item, origQty, origPrice, inactive, qtyChanged, priceChanged, kind }) => (
              <tr key={item.id} className={tone[kind]}>
                <td className="py-2.5 pr-3 align-top">
                  <span className="font-serif text-sm text-foreground">{item.title}</span>
                  <span className="block text-[11px] text-muted">
                    {[item.color, item.size].filter(Boolean).join(" • ")}
                  </span>
                </td>
                <td className="py-2.5 pr-3 align-top">
                  {origQty !== null && origPrice !== null ? (
                    <>
                      {origQty} × {money(origPrice)}
                      <span className="block text-[11px] text-muted">{money(origQty * origPrice)}</span>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="py-2.5 align-top">
                  {inactive ? (
                    <span className="font-semibold text-red-700">
                      {item.item_status === "removed" ? t("compare.removed") : t("compare.unavailable")}
                    </span>
                  ) : (
                    <>
                      <span className={qtyChanged || priceChanged ? "font-semibold text-foreground" : ""}>
                        <span className={qtyChanged ? "underline decoration-amber-500 decoration-2 underline-offset-2" : ""}>{item.qty}</span>
                        {" × "}
                        <span className={priceChanged ? "underline decoration-amber-500 decoration-2 underline-offset-2" : ""}>
                          {money(Number(item.unit_price))}
                        </span>
                      </span>
                      <span className="block text-[11px] text-muted">{money(item.qty * Number(item.unit_price))}</span>
                      {kind === "changed" && <span className="block text-[11px] font-semibold text-amber-700">{t("compare.changed")}</span>}
                      {kind === "added" && <span className="block text-[11px] font-semibold text-emerald-700">{t("compare.added")}</span>}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-xs">
            <tr className="border-t border-border">
              <td className="py-2 pr-3 font-semibold">{t("compare.subtotal")}</td>
              <td className="py-2 pr-3">{totals.originalSubtotal !== null ? money(original) : "—"}</td>
              <td className={`py-2 font-semibold ${diff !== 0 ? "text-amber-700" : ""}`}>
                {money(totals.subtotal)}
                {diff !== 0 && totals.originalSubtotal !== null && (
                  <span className="block text-[11px]">
                    {diff > 0 ? "+" : "−"}
                    {money(Math.abs(diff))}
                  </span>
                )}
              </td>
            </tr>
            <tr>
              <td className="py-1 pr-3 text-muted">{t("compare.freight")}</td>
              <td className="py-1 pr-3 text-muted">{t("compare.notIncluded")}</td>
              <td className="py-1">{totals.chargesInformed ? money(totals.shipping) : t("compare.afterConfirmation")}</td>
            </tr>
            <tr>
              <td className="py-1 pr-3 text-muted">{t("compare.duties")}</td>
              <td className="py-1 pr-3 text-muted">{t("compare.notIncluded")}</td>
              <td className="py-1">{totals.chargesInformed ? money(totals.duties + totals.other) : t("compare.afterConfirmation")}</td>
            </tr>
            {totals.chargesInformed && (
              <tr className="border-t border-border font-semibold">
                <td className="py-2 pr-3">{t("compare.total")}</td>
                <td className="py-2 pr-3">—</td>
                <td className="py-2">{money(totals.total)}</td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      <ul className="flex flex-wrap gap-3 text-[10px] text-muted">
        <li><span className="inline-block w-2.5 h-2.5 bg-amber-200 mr-1 align-middle" />{t("compare.legendChanged")}</li>
        <li><span className="inline-block w-2.5 h-2.5 bg-red-200 mr-1 align-middle" />{t("compare.legendRemoved")}</li>
        <li><span className="inline-block w-2.5 h-2.5 bg-emerald-200 mr-1 align-middle" />{t("compare.legendAdded")}</li>
      </ul>
    </section>
  );
}
