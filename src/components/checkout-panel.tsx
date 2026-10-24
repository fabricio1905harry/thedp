"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useCart } from "@/components/cart-provider";
import { useCurrency } from "@/components/currency-provider";
import { formatCurrency, pickPrice } from "@/lib/currency";
import { placeOrderServerAction } from "@/app/[locale]/checkout/actions";
import { ShipSmartAddress } from "@/lib/shipsmart";
import { CartThumb } from "@/components/cart-thumb";
import { CountrySelect } from "@/components/country-select";
import { toCountryCode } from "@/lib/countries";
import { MinimumNotice, useCartCommercial, useShortfallText } from "@/components/cart-commercial";

interface Address {
  id: string;
  country: string;
  state?: string | null;
  city: string | null;
  line1: string;
  postal_code: string | null;
}

/** Defaults from the account / wholesale application (used when there is no saved address). */
export interface CheckoutDefaults {
  recipientName: string;
  /** free-text delivery address from the wholesale application */
  deliveryAddress: string;
  /** ISO country code chosen at signup */
  country: string;
}

export function CheckoutPanel({ addresses, defaults }: { addresses: Address[]; defaults: CheckoutDefaults }) {
  const locale = useLocale();
  const tCart = useTranslations("cart");
  const t = useTranslations("checkout");
  const tProduct = useTranslations("product");
  const router = useRouter();
  const { items, clear } = useCart();
  const { currency } = useCurrency();
  const tCommercial = useTranslations("commercial");
  const { status: commercial } = useCartCommercial();
  const shortfallText = useShortfallText();
  const minimumBlocked = commercial.shortfalls.length > 0;
  const volumeDiscount = commercial.volume.enabled ? commercial.volume.discountTotal : 0;

  // Orders are DDP (duties prepaid). Freight and import duties are NOT
  // calculated here: the TDP informs them after confirming stock with the
  // supplier, before releasing the Confirmed Order for payment.
  const isDdp = true;

  const first = addresses[0];
  const [selectedAddressId, setSelectedAddressId] = useState(first?.id ?? "new");
  const [saveAddress, setSaveAddress] = useState(!first);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Custom address fields
  // Prefill: newest saved address → wholesale application delivery address → empty.
  const [recipientName, setRecipientName] = useState(defaults.recipientName);
  const [addressLine, setAddressLine] = useState(first?.line1 ?? defaults.deliveryAddress);
  const [city, setCity] = useState(first?.city ?? "");
  const [state, setState] = useState(first?.state ?? "");
  const pieceCount = items.reduce((sum, i) => sum + i.qty, 0);
  const [postalCode, setPostalCode] = useState(first?.postal_code ?? "");
  const [countryCode, setCountryCode] = useState(toCountryCode(first?.country) ?? defaults.country ?? "");

  const subtotal = items.reduce((sum, item) => {
    const picked = pickPrice(item.pricing, currency);
    return sum + (picked?.amount ?? 0) * item.qty;
  }, 0);

  if (items.length === 0) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-sm text-muted">
          {tCart("empty")}. <Link href="/" className="text-accent underline font-medium">{tCart("browseCatalog")}</Link>.
        </p>
      </div>
    );
  }


  async function handlePlaceOrder() {
    try {
      setPlacingOrder(true);
      setErrorMsg(null);

      if (!recipientName.trim() || !addressLine.trim() || !city.trim()) {
        setErrorMsg(t("errors.address"));
        setPlacingOrder(false);
        return;
      }
      if (!countryCode) {
        setErrorMsg(t("errors.country"));
        setPlacingOrder(false);
        return;
      }

      const customAddress: ShipSmartAddress = {
        name: recipientName.trim(),
        address: addressLine.trim(),
        city: city.trim(),
        state: state.trim(),
        postalCode: postalCode.trim(),
        countryCode,
      };

      const cartItems = items.map((item) => {
        const picked = pickPrice(item.pricing, currency);
        return {
          variantId: item.variantId,
          productSlug: item.productSlug,
          title: item.title,
          color: item.color,
          size: item.size,
          qty: item.qty,
          price: picked?.amount ?? 0,
        };
      });

      const res = await placeOrderServerAction({
        addressId: selectedAddressId !== "new" ? selectedAddressId : undefined,
        customAddress,
        currency,
        items: cartItems,
        isDdp,
        locale,
        // a saved address is reused as is; a typed one can be saved
        saveAddress: selectedAddressId === "new" ? saveAddress : false,
      });

      if (res.minimumShortfalls?.length) {
        setErrorMsg(res.minimumShortfalls.map(shortfallText).join(" "));
        setPlacingOrder(false);
        return;
      }
      if (res.success && res.orderId) {
        clear();
        router.push(`/pedidos/${res.orderId}`);
      } else {
        const base = res.errorCode ? t(`errors.${res.errorCode}`) : t("orderFailedGeneric");
        // for unexpected failures also show the technical reason, so support can tell what happened
        setErrorMsg(res.errorCode === "generic" && res.error ? `${base} (${res.error})` : base);
        setPlacingOrder(false);
      }
    } catch (err: unknown) {
      console.error("[checkout] place order failed", err);
      setErrorMsg(`${t("unexpectedError")}${err instanceof Error && err.message ? ` (${err.message.slice(0, 160)})` : ""}`);
      setPlacingOrder(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left Column: Address & Shipping Options */}
      <div className="lg:col-span-7 space-y-8 bg-white p-6 rounded-sm border border-border/80 shadow-xs">
        {/* Address Selection */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4 pb-2 border-b border-border">
            {t("step1Title")}
          </h2>

          {addresses.length > 0 && (
            <div className="space-y-2 mb-4">
              {addresses.map((a) => (
                <label
                  key={a.id}
                  className={`flex items-start gap-3 text-xs p-3.5 rounded border cursor-pointer transition-all ${
                    selectedAddressId === a.id
                      ? "border-accent bg-accent/5 ring-1 ring-accent/30 font-medium"
                      : "border-border/80 hover:border-gray-400"
                  }`}
                >
                  <input
                    type="radio"
                    name="address"
                    checked={selectedAddressId === a.id}
                    onChange={() => {
                      setSelectedAddressId(a.id);
                      setAddressLine(a.line1);
                      setCity(a.city ?? "");
                      setState(a.state ?? "");
                      setPostalCode(a.postal_code ?? "");
                      setCountryCode(toCountryCode(a.country) ?? "");
                    }}
                    className="mt-0.5 accent-accent"
                  />
                  <div>
                    <p className="font-semibold text-foreground">{a.line1}</p>
                    <p className="text-muted text-[11px]">{a.city}, {a.postal_code} • {toCountryCode(a.country) ?? a.country}</p>
                  </div>
                </label>
              ))}
              <label
                className={`flex items-center gap-3 text-xs p-3.5 rounded border cursor-pointer transition-all ${
                  selectedAddressId === "new" ? "border-accent bg-accent/5 ring-1 ring-accent/30 font-medium" : "border-border/80 hover:border-gray-400"
                }`}
              >
                <input
                  type="radio"
                  name="address"
                  checked={selectedAddressId === "new"}
                  onChange={() => {
                    setSelectedAddressId("new");
                    setAddressLine("");
                    setCity("");
                    setState("");
                    setPostalCode("");
                    setSaveAddress(true);
                  }}
                  className="accent-accent"
                />
                <span>{t("useNewAddress")}</span>
              </label>
            </div>
          )}

          {/* Form fields */}
          <div className="space-y-3 pt-2">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-muted font-medium mb-1">
                {t("recipientName")}
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder={t("recipientNamePlaceholder")}
                className="w-full px-3 py-2 text-xs border border-border rounded focus:outline-none focus:border-accent bg-background"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-muted font-medium mb-1">
                {t("addressLine")}
              </label>
              <input
                type="text"
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                placeholder={t("addressLinePlaceholder")}
                className="w-full px-3 py-2 text-xs border border-border rounded focus:outline-none focus:border-accent bg-background"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted font-medium mb-1">
                  {t("city")}
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder={t("cityPlaceholder")}
                  className="w-full px-3 py-2 text-xs border border-border rounded focus:outline-none focus:border-accent bg-background"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted font-medium mb-1">
                  {t("state")}
                </label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder={t("statePlaceholder")}
                  className="w-full px-3 py-2 text-xs border border-border rounded focus:outline-none focus:border-accent bg-background"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted font-medium mb-1">
                  {t("postalCode")}
                </label>
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder={t("postalCodePlaceholder")}
                  className="w-full px-3 py-2 text-xs border border-border rounded focus:outline-none focus:border-accent bg-background"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted font-medium mb-1">
                  {t("country")}
                </label>
                <CountrySelect
                  value={countryCode}
                  onChange={setCountryCode}
                  className="w-full px-3 py-2 text-xs border border-border rounded focus:outline-none focus:border-accent bg-background"
                />
              </div>
            </div>

            {selectedAddressId === "new" && (
              <label className="flex items-center gap-2 text-xs pt-1">
                <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} className="accent-accent" />
                {t("saveAddress")}
              </label>
            )}
          </div>
        </div>

        {/* Real-time DHL Shipping Calculation Card */}
        <div className="border-t border-border pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4">
            {t("step2Title")}
          </h2>

          <div className="bg-surface border border-border rounded-sm p-4 flex items-start gap-3">
            <div className="w-9 h-9 shrink-0 rounded-full bg-foreground text-background flex items-center justify-center text-base">
              ✈
            </div>
            <div>
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                {t("dhlExpressWorldwide")}
              </h4>
              <p className="text-[11px] text-muted mt-1 leading-relaxed">{t("chargesAfterStockConfirmation")}</p>
            </div>
          </div>

          {/* DDP is mandatory in every locale — fixed, non-toggleable, and
              its estimate always shows in the order summary below. */}
          <div className="pt-4">
            <p className="flex items-start gap-2.5 text-xs text-foreground">
              <input type="checkbox" checked readOnly disabled className="mt-0.5 accent-accent" />
              <span>
                <strong>{t("ddpTitle")}</strong> — {t("ddpDescriptionMandatory")}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Right Column: Order Summary & Place Order */}
      <div className="lg:col-span-5 space-y-6 bg-white p-6 rounded-sm border border-border/80 shadow-xs">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-accent pb-2 border-b border-border">
          {t("orderSummary")} ({pieceCount} {pieceCount === 1 ? tProduct("piece") : tProduct("pieces")})
        </h2>

        {/* Items List */}
        <div className="divide-y divide-border/60 max-h-72 overflow-y-auto pr-1">
          {items.map((item) => {
            const picked = pickPrice(item.pricing, currency);
            return (
              <div key={item.variantId} className="py-3 flex items-center gap-3 text-xs">
                <CartThumb src={item.imageUrl} crop={item.imageCrop} title={item.title} className="w-10" />
                <div className="flex-1 min-w-0">
                  <h4 className="font-serif text-sm font-medium text-foreground">{item.title}</h4>
                  <p className="text-[11px] text-muted">
                    {t("colorLabel")} {item.color} • {t("sizeLabel")} {item.size} • {t("qtyLabel")} {item.qty}
                  </p>
                </div>
                <div className="text-right font-semibold text-foreground">
                  {picked ? formatCurrency(picked.amount * item.qty, picked.currency) : "—"}
                </div>
              </div>
            );
          })}
        </div>

        {/* Pricing Totals Breakdown */}
        <div className="space-y-2.5 pt-4 border-t border-border text-xs">
          <div className="flex justify-between text-muted">
            <span>{t("subtotalDresses")}</span>
            <span className="font-medium text-foreground">{formatCurrency(subtotal, currency)}</span>
          </div>

          {volumeDiscount > 0 && (
            <div className="flex justify-between text-muted">
              <span>{tCommercial("volume.applied")}</span>
              <span className="font-medium text-foreground">− {formatCurrency(volumeDiscount, currency)}</span>
            </div>
          )}

          <div className="flex justify-between text-muted">
            <span>{t("shippingDhl")}</span>
            <span className="font-medium text-foreground text-right">{t("toBeInformed")}</span>
          </div>

          <div className="flex justify-between text-muted">
            <span>{t("ddpEstimateLabel")}</span>
            <span className="font-medium text-foreground text-right">{t("toBeInformed")}</span>
          </div>

          <div className="flex justify-between pt-3 border-t border-border font-serif text-lg font-bold text-foreground">
            <span>{t("totalProducts")}</span>
            <span className="text-accent">{formatCurrency(Math.max(0, subtotal - volumeDiscount), currency)}</span>
          </div>
          <p className="text-[11px] text-muted leading-relaxed">{t("chargesAfterStockConfirmation")}</p>
          <p className="text-[11px] text-muted leading-relaxed">{tCart("quantityNote")}</p>
        </div>

        {errorMsg && (
          <div className="p-3 bg-surface border-2 border-foreground rounded text-xs text-foreground font-semibold">
            {errorMsg}
          </div>
        )}

        <MinimumNotice shortfalls={commercial.shortfalls} />

        {/* Place Order Button */}
        <button
          onClick={handlePlaceOrder}
          disabled={placingOrder || minimumBlocked}
          className="btn-primary w-full py-4 text-xs uppercase tracking-[0.2em] font-semibold flex items-center justify-center gap-2"
        >
          {placingOrder ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              <span>{t("placingOrder")}</span>
            </>
          ) : (
            <span>{t("placeOrderCta")} →</span>
          )}
        </button>

        <p className="text-[10px] text-center text-muted leading-relaxed">
          {t("placeOrderNotice")}
        </p>
      </div>
    </div>
  );
}
