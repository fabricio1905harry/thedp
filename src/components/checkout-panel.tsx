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

export function CheckoutPanel({ addresses }: { addresses: Address[] }) {
  const tCart = useTranslations("cart");
  const router = useRouter();
  const { items, clear } = useCart();
  const { currency } = useCurrency();

  const [selectedAddressId, setSelectedAddressId] = useState(addresses[0]?.id ?? "new");
  const [isDdp, setIsDdp] = useState(false);
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
        setErrorMsg(res.error || "Não foi possível finalizar o pedido.");
        setPlacingOrder(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro inesperado ao finalizar pedido";
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
            1. Endereço de Entrega Internacional
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
                Nome Completo do Destinatário
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Ex: Jane Doe"
                className="w-full px-3 py-2 text-xs border border-border rounded focus:outline-none focus:border-accent bg-background"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-muted font-medium mb-1">
                Endereço / Logradouro
              </label>
              <input
                type="text"
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                placeholder="Ex: 5th Avenue, 100"
                className="w-full px-3 py-2 text-xs border border-border rounded focus:outline-none focus:border-accent bg-background"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted font-medium mb-1">
                  Cidade
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Ex: Nova York"
                  className="w-full px-3 py-2 text-xs border border-border rounded focus:outline-none focus:border-accent bg-background"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted font-medium mb-1">
                  Estado / Província
                </label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="Ex: NY"
                  className="w-full px-3 py-2 text-xs border border-border rounded focus:outline-none focus:border-accent bg-background"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted font-medium mb-1">
                  Código Postal / CEP
                </label>
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="Ex: 10001"
                  className="w-full px-3 py-2 text-xs border border-border rounded focus:outline-none focus:border-accent bg-background"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted font-medium mb-1">
                  País (Código ISO)
                </label>
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-border rounded focus:outline-none focus:border-accent bg-background cursor-pointer"
                >
                  <option value="US">Estados Unidos (US)</option>
                  <option value="PT">Portugal (PT)</option>
                  <option value="ES">Espanha (ES)</option>
                  <option value="FR">França (FR)</option>
                  <option value="DE">Alemanha (DE)</option>
                  <option value="IT">Itália (IT)</option>
                  <option value="GB">Reino Unido (UK)</option>
                  <option value="CA">Canadá (CA)</option>
                  <option value="MX">México (MX)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Real-time DHL Shipping Calculation Card */}
        <div className="border-t border-border pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4">
            2. Opção de Envio Expresso DHL
          </h2>

          <div className="bg-gradient-to-r from-amber-950/5 to-amber-900/10 border border-gold/40 rounded-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gold/20 text-gold flex items-center justify-center text-base">
                  ✈
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    DHL Express Worldwide
                  </h4>
                  <p className="text-[11px] text-muted">
                    {loadingShipping ? (
                      <span className="animate-pulse">Calculando cotação em tempo real...</span>
                    ) : (
                      `Prazo de entrega: ~${shippingQuote?.deliveryDays || 3} dias úteis`
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
                  Embalagem: <strong className="text-foreground">{shippingQuote.packageName}</strong> ({shippingQuote.dimensionsText})
                </span>
                <span>
                  Peso Final: <strong className="text-foreground">{shippingQuote.totalWeightKg} kg</strong>
                </span>
              </div>
            )}
          </div>

          {/* DDP vs DDU Checkbox */}
          <div className="pt-4">
            <label className="flex items-start gap-2.5 text-xs text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={isDdp}
                onChange={(e) => setIsDdp(e.target.checked)}
                className="mt-0.5 accent-accent"
              />
              <span>
                <strong>Incluir Estimativa de Impostos de Importação (DDP)</strong> — Pague os impostos antecipadamente para liberação alfandegária expressa sem retenções.
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Right Column: Order Summary & Place Order */}
      <div className="lg:col-span-5 space-y-6 bg-white p-6 rounded-sm border border-border/80 shadow-xs">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-accent pb-2 border-b border-border">
          Resumo do Pedido ({items.length} {items.length === 1 ? "peça" : "peças"})
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
                    Cor: {item.color} • Tam: {item.size} • Qtd: {item.qty}
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
            <span>Subtotal dos Vestidos:</span>
            <span className="font-medium text-foreground">{formatCurrency(subtotal, currency)}</span>
          </div>

          <div className="flex justify-between text-muted">
            <span>Frete DHL Express:</span>
            <span className="font-medium text-foreground">
              {loadingShipping ? "..." : formatCurrency(shippingCost, currency)}
            </span>
          </div>

          {isDdp && (
            <div className="flex justify-between text-muted">
              <span>Estimativa Impostos DDP:</span>
              <span className="font-medium text-foreground">{formatCurrency(dutiesEstimate, currency)}</span>
            </div>
          )}

          <div className="flex justify-between pt-3 border-t border-border font-serif text-lg font-bold text-foreground">
            <span>Total Final:</span>
            <span className="text-accent">{formatCurrency(grandTotal, currency)}</span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {errorMsg}
          </div>
        )}

        {/* Place Order Button */}
        <button
          onClick={handlePlaceOrder}
          disabled={placingOrder || loadingShipping}
          className="w-full bg-accent hover:bg-accent-hover text-white py-4 text-xs uppercase tracking-[0.2em] font-semibold transition-all shadow-lg hover:shadow-xl rounded-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {placingOrder ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              <span>Gerando Remessa DHL...</span>
            </>
          ) : (
            <span>Finalizar Pedido via DHL Express →</span>
          )}
        </button>

        <p className="text-[10px] text-center text-muted leading-relaxed">
          Ao clicar em finalizar, a sua remessa e o código AWB DHL serão gerados automaticamente.
        </p>
      </div>
    </div>
  );
}
