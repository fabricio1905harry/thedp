"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useCart } from "@/components/cart-provider";
import { useCurrency } from "@/components/currency-provider";
import { formatCurrency, pickPrice } from "@/lib/currency";
import {
  calculateCheckoutShippingAction,
  placeOrderServerAction,
  CalculateShippingResult,
} from "@/app/[locale]/checkout/actions";
import { ShipSmartAddress } from "@/lib/shipsmart";

interface Address {
  id: string;
  country: string;
  city: string | null;
  line1: string;
  postal_code: string | null;
}

const COUNTRY_CODES = ["US", "PT", "ES", "FR", "DE", "IT", "GB", "CA", "MX"] as const;

export function CheckoutPanel({ addresses }: { addresses: Address[] }) {
  const tCart = useTranslations("cart");
  const t = useTranslations("checkout");
  const tProduct = useTranslations("product");
  const router = useRouter();
  const { items, clear } = useCart();
  const { currency } = useCurrency();

  // Import-duty (DDP) estimate is mandatory and always shown in the total,
  // in every locale — no opt-out toggle.
  const isDdp = true;

  const [selectedAddressId, setSelectedAddressId] = useState(addresses[0]?.id ?? "new");
  const [loadingShipping, setLoadingShipping] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Custom address fields
  const [recipientName, setRecipientName] = useState("");
  const [addressLine, setAddressLine] = useState(addresses[0]?.line1 ?? "");
  const [city, setCity] = useState(addresses[0]?.city ?? "");
  const [state, setState] = useState("NY");
  const [postalCode, setPostalCode] = useState(addresses[0]?.postal_code ?? "");
  const [countryCode, setCountryCode] = useState(addresses[0]?.country ?? "US");

  // Shipping Quote state
  const [shippingQuote, setShippingQuote] = useState<CalculateShippingResult | null>(null);

  const subtotal = items.reduce((sum, item) => {
    const picked = pickPrice(item.pricing, currency);
    return sum + (picked?.amount ?? 0) * item.qty;
  }, 0);

  // Recalculate DHL shipping whenever address or items change
  useEffect(() => {
    if (items.length === 0) return;

    let isMounted = true;
    setLoadingShipping(true);

    const customAddress: ShipSmartAddress = {
      name: recipientName || "Cliente",
      address: addressLine || "Rua Exemplo, 100",
      city: city || "Nova York",
      state: state || "NY",
      postalCode: postalCode || "10001",
      countryCode: countryCode || "US",
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

    calculateCheckoutShippingAction({
      customAddress,
      currency,
      items: cartItems,
      isDdp,
    }).then((res) => {
      if (isMounted) {
        if (res.success) {
          setShippingQuote(res);
        }
        setLoadingShipping(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [items, selectedAddressId, addressLine, city, state, postalCode, countryCode, currency, isDdp, recipientName]);

  if (items.length === 0) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-sm text-muted">
          {tCart("empty")}. <Link href="/" className="text-accent underline font-medium">{tCart("browseCatalog")}</Link>.
        </p>
      </div>
    );
  }

  const shippingCost = shippingQuote?.shippingPriceBrl ?? 0;
  const dutiesEstimate = isDdp ? (shippingQuote?.dutiesEstimateBrl ?? 0) : 0;
  const grandTotal = subtotal + shippingCost + dutiesEstimate;

  async function handlePlaceOrder() {
    try {
      setPlacingOrder(true);
      setErrorMsg(null);

      const customAddress: ShipSmartAddress = {
        name: recipientName || "Cliente",
        address: addressLine || "Rua Exemplo",
        city: city || "Cidade",
        state: state || "UF",
        postalCode: postalCode || "00000",
        countryCode: countryCode || "US",
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
      });

      if (res.success && res.orderId) {
        clear();
        router.push(`/pedidos/${res.orderId}`);
      } else {
        setErrorMsg(res.error || t("orderFailedGeneric"));
        setPlacingOrder(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("unexpectedError");
      setErrorMsg(msg);
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
                      setPostalCode(a.postal_code ?? "");
                      setCountryCode(a.country ?? "US");
                    }}
                    className="mt-0.5 accent-accent"
                  />
                  <div>
                    <p className="font-semibold text-foreground">{a.line1}</p>
                    <p className="text-muted text-[11px]">{a.city}, {a.postal_code} • {a.country}</p>
                  </div>
                </label>
              ))}
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
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-border rounded focus:outline-none focus:border-accent bg-background cursor-pointer"
                >
                  {COUNTRY_CODES.map((code) => (
                    <option key={code} value={code}>
                      {t(`countries.${code}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Real-time DHL Shipping Calculation Card */}
        <div className="border-t border-border pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4">
            {t("step2Title")}
          </h2>

          <div className="bg-surface border border-border rounded-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center text-base">
                  ✈
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    {t("dhlExpressWorldwide")}
                  </h4>
                  <p className="text-[11px] text-muted">
                    {loadingShipping ? (
                      <span className="animate-pulse">{t("calculatingQuote")}</span>
                    ) : (
                      t("deliveryEstimate", { days: shippingQuote?.deliveryDays || 3 })
                    )}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-sm font-bold text-accent">
                  {loadingShipping ? "..." : formatCurrency(shippingCost, currency)}
                </span>
              </div>
            </div>

            {shippingQuote && (
              <div className="pt-2 border-t border-gold/20 flex flex-wrap items-center justify-between text-[11px] text-muted gap-2">
                <span>
                  {t("packagingLabel")} <strong className="text-foreground">{shippingQuote.packageName}</strong> ({shippingQuote.dimensionsText})
                </span>
                <span>
                  {t("finalWeightLabel")} <strong className="text-foreground">{shippingQuote.totalWeightKg} kg</strong>
                </span>
              </div>
            )}
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
          {t("orderSummary")} ({items.length} {items.length === 1 ? tProduct("piece") : tProduct("pieces")})
        </h2>

        {/* Items List */}
        <div className="divide-y divide-border/60 max-h-72 overflow-y-auto pr-1">
          {items.map((item) => {
            const picked = pickPrice(item.pricing, currency);
            return (
              <div key={item.variantId} className="py-3 flex items-center justify-between text-xs">
                <div>
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

          <div className="flex justify-between text-muted">
            <span>{t("shippingDhl")}</span>
            <span className="font-medium text-foreground">
              {loadingShipping ? "..." : formatCurrency(shippingCost, currency)}
            </span>
          </div>

          <div className="flex justify-between text-muted">
            <span>{t("ddpEstimateLabel")}</span>
            <span className="font-medium text-foreground">{formatCurrency(dutiesEstimate, currency)}</span>
          </div>

          <div className="flex justify-between pt-3 border-t border-border font-serif text-lg font-bold text-foreground">
            <span>{t("totalFinal")}</span>
            <span className="text-accent">{formatCurrency(grandTotal, currency)}</span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-surface border-2 border-foreground rounded text-xs text-foreground font-semibold">
            {errorMsg}
          </div>
        )}

        {/* Place Order Button */}
        <button
          onClick={handlePlaceOrder}
          disabled={placingOrder || loadingShipping}
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
