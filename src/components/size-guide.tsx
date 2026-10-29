"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { cmToIn, type SizeChartRow } from "@/lib/size-format";

/** "Size guide" link + modal with the size table (BR / US / EU / letter / measurements). */
export function SizeGuideButton({ chart }: { chart: SizeChartRow[] }) {
  const t = useTranslations("c2.sizes");
  const ref = useRef<HTMLDialogElement>(null);
  if (chart.length === 0) return null;

  const hasMeasures = chart.some((r) => r.bust_cm || r.waist_cm || r.hip_cm);
  const hasNotes = chart.some((r) => r.note);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="text-xs underline underline-offset-2 text-foreground hover:text-accent"
      >
        {t("guide")}
      </button>
      <dialog
        ref={ref}
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
        className="m-auto w-[min(92vw,40rem)] max-h-[85vh] overflow-auto border border-border bg-background p-0 text-foreground backdrop:bg-black/50"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-serif text-xl">{t("title")}</h2>
          <button type="button" onClick={() => ref.current?.close()} aria-label={t("close")} className="w-8 h-8 flex items-center justify-center border border-border">
            ✕
          </button>
        </div>
        <div className="p-5 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-muted">
                <th className="py-2 pr-4 font-semibold">{t("letter")}</th>
                <th className="py-2 pr-4 font-semibold">BR</th>
                <th className="py-2 pr-4 font-semibold">US</th>
                {hasMeasures && <th className="py-2 pr-4 font-semibold">{t("bust")}</th>}
                {hasMeasures && <th className="py-2 pr-4 font-semibold">{t("waist")}</th>}
                {hasMeasures && <th className="py-2 pr-4 font-semibold">{t("hip")}</th>}
                {hasNotes && <th className="py-2 font-semibold">{t("note")}</th>}
              </tr>
            </thead>
            <tbody>
              {chart.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-2 pr-4 font-medium">{r.letter ?? "—"}</td>
                  <td className="py-2 pr-4">{r.size_br}</td>
                  <td className="py-2 pr-4">{r.size_us ?? "—"}</td>
                  {hasMeasures && <td className="py-2 pr-4 whitespace-nowrap">{r.bust_cm ? `${r.bust_cm} cm / ${cmToIn(r.bust_cm)} in` : "—"}</td>}
                  {hasMeasures && <td className="py-2 pr-4 whitespace-nowrap">{r.waist_cm ? `${r.waist_cm} cm / ${cmToIn(r.waist_cm)} in` : "—"}</td>}
                  {hasMeasures && <td className="py-2 pr-4 whitespace-nowrap">{r.hip_cm ? `${r.hip_cm} cm / ${cmToIn(r.hip_cm)} in` : "—"}</td>}
                  {hasNotes && <td className="py-2 text-muted">{r.note}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {hasMeasures && <p className="mt-3 text-xs text-muted">{t("cm")}</p>}
          <p className="mt-3 text-xs text-muted leading-relaxed">{t("disclaimer")}</p>
        </div>
      </dialog>
    </>
  );
}
