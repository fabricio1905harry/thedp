"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { chooseDeliveryMode } from "@/app/[locale]/pedidos/[id]/actions";

/** Confirmed Order: Ship now vs Reserve for later delivery (the buyer decides; the TDP can still adjust in the Admin). */
export function DeliveryModeChoice({ orderId, current, minDate }: { orderId: string; current: "standard" | "reserve"; minDate: string }) {
  const t = useTranslations("order.deliveryMode");
  const router = useRouter();
  const [mode, setMode] = useState<"ship_now" | "reserve">(current === "reserve" ? "reserve" : "ship_now");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function apply(next: "ship_now" | "reserve") {
    setMode(next);
    setError(null);
    if (next === "reserve" && !date) return; // wait for the desired date
    start(async () => {
      const res = await chooseDeliveryMode(orderId, next, next === "reserve" ? date : undefined);
      if (res.error) {
        setError(t(`errors.${res.error}`));
        return;
      }
      router.refresh();
    });
  }

  const option = "flex items-start gap-3 border p-4 cursor-pointer";
  return (
    <div className="border border-border p-5 space-y-3 bg-white">
      <h3 className="text-xs uppercase tracking-[0.2em] font-semibold text-accent">{t("title")}</h3>
      <label className={`${option} ${mode === "ship_now" ? "border-foreground" : "border-border"}`}>
        <input type="radio" name="delivery-mode" className="mt-1" checked={mode === "ship_now"} disabled={pending} onChange={() => apply("ship_now")} />
        <span>
          <span className="block text-sm font-semibold">{t("shipNow")}</span>
          <span className="block text-xs text-muted">{t("shipNowText")}</span>
        </span>
      </label>
      <label className={`${option} ${mode === "reserve" ? "border-foreground" : "border-border"}`}>
        <input type="radio" name="delivery-mode" className="mt-1" checked={mode === "reserve"} disabled={pending} onChange={() => setMode("reserve")} />
        <span className="space-y-2">
          <span className="block text-sm font-semibold">{t("reserve")}</span>
          <span className="block text-xs text-muted">{t("reserveText")}</span>
          {mode === "reserve" && (
            <span className="flex flex-wrap items-end gap-2">
              <label className="text-xs space-y-1">
                <span className="block">{t("desiredDate")}</span>
                <input type="date" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} className="border border-border px-2 py-1.5 text-sm" />
              </label>
              <button
                type="button"
                disabled={pending || !date}
                onClick={() => apply("reserve")}
                className="btn-primary px-4 py-2 text-[11px] uppercase tracking-[0.2em] font-semibold disabled:opacity-50"
              >
                {current === "reserve" ? t("update") : t("confirm")}
              </button>
            </span>
          )}
        </span>
      </label>
      {error && <p role="alert" className="text-xs text-accent font-semibold">{error}</p>}
    </div>
  );
}
