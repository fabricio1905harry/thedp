"use client";

import { useState, useTransition } from "react";
import { useLocale } from "next-intl";
import { submitBrandApplication } from "@/app/[locale]/seja-uma-marca/actions";
import { BRAND_OPPORTUNITY_TYPES, BRAND_PRODUCT_CATEGORIES, BRAND_WHOLESALE_PRESENCE } from "@/lib/brand-application";

const X = {
  en: {
    categories: "Product categories", markets: "Current markets (countries / regions where you sell)", presence: "Do you already sell wholesale?", opportunity: "Type of opportunity", choose: "Select…",
    cat: { dresses: "Dresses", tops: "Tops", bottoms: "Bottoms", knitwear: "Knitwear", swimwear: "Swimwear", accessories: "Accessories", other: "Other" },
    pres: { yes: "Yes", starting: "Starting now", no: "No" },
    opp: { distribution: "Distribution", wholesale: "Wholesale", partnership: "Brand partnership", other: "Other" },
  },
  es: {
    categories: "Categorías de producto", markets: "Mercados actuales (países / regiones donde vendes)", presence: "¿Ya vendes al por mayor?", opportunity: "Tipo de oportunidad", choose: "Seleccionar…",
    cat: { dresses: "Vestidos", tops: "Tops", bottoms: "Pantalones y faldas", knitwear: "Punto", swimwear: "Trajes de baño", accessories: "Accesorios", other: "Otro" },
    pres: { yes: "Sí", starting: "Empezando ahora", no: "No" },
    opp: { distribution: "Distribución", wholesale: "Venta mayorista", partnership: "Alianza de marca", other: "Otro" },
  },
  pt: {
    categories: "Categorias de produto", markets: "Mercados atuais (países / regiões onde vende)", presence: "Você já vende no atacado?", opportunity: "Tipo de oportunidade", choose: "Selecionar…",
    cat: { dresses: "Vestidos", tops: "Blusas e tops", bottoms: "Calças e saias", knitwear: "Tricô", swimwear: "Moda praia", accessories: "Acessórios", other: "Outro" },
    pres: { yes: "Sim", starting: "Começando agora", no: "Não" },
    opp: { distribution: "Distribuição", wholesale: "Atacado", partnership: "Parceria de marca", other: "Outro" },
  },
} as const;

const T = {
  en: { brand: "Brand name", name: "Your name", email: "E-mail", phone: "Phone / WhatsApp", website: "Website", instagram: "Instagram", country: "Country", message: "Tell us about your brand", send: "SEND APPLICATION", ok: "Thank you! Our team will review your application and get back to you.", invalid: "Please fill in the brand name, your name and a valid e-mail.", failed: "Could not send. Please try again." },
  es: { brand: "Nombre de la marca", name: "Tu nombre", email: "Correo", phone: "Teléfono / WhatsApp", website: "Sitio web", instagram: "Instagram", country: "País", message: "Cuéntanos sobre tu marca", send: "ENVIAR SOLICITUD", ok: "¡Gracias! Nuestro equipo revisará tu solicitud y te responderá.", invalid: "Completa el nombre de la marca, tu nombre y un correo válido.", failed: "No se pudo enviar. Inténtalo de nuevo." },
  pt: { brand: "Nome da marca", name: "Seu nome", email: "E-mail", phone: "Telefone / WhatsApp", website: "Site", instagram: "Instagram", country: "País", message: "Conte sobre a sua marca", send: "ENVIAR CANDIDATURA", ok: "Obrigado! Nossa equipe vai analisar sua candidatura e retornar.", invalid: "Preencha o nome da marca, seu nome e um e-mail válido.", failed: "Não foi possível enviar. Tente novamente." },
} as const;

export function BrandApplicationForm() {
  const locale = useLocale();
  const key = (locale in T ? locale : "en") as keyof typeof T;
  const t = T[key];
  const x = X[key];
  const [f, setF] = useState({ brandName: "", contactName: "", email: "", phone: "", website: "", instagram: "", country: "", message: "", company2: "", productCategories: [] as string[], currentMarkets: "", wholesalePresence: "", opportunityType: "" });
  const [state, setState] = useState<"idle" | "ok" | "invalid" | "failed">("idle");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const toggleCategory = (c: string) =>
    setF((s) => ({ ...s, productCategories: s.productCategories.includes(c) ? s.productCategories.filter((v) => v !== c) : [...s.productCategories, c] }));
  const box = "w-full border border-border bg-background px-3 py-2.5 text-sm";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await submitBrandApplication({ ...f, locale });
      setState(res.ok ? "ok" : (res.error ?? "failed"));
    });
  }

  if (state === "ok") return <p role="status" className="border border-foreground p-5 text-sm">{t.ok}</p>;

  return (
    <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
      <label className="text-xs space-y-1">{t.brand}<input required className={box} value={f.brandName} onChange={set("brandName")} /></label>
      <label className="text-xs space-y-1">{t.name}<input required className={box} value={f.contactName} onChange={set("contactName")} /></label>
      <label className="text-xs space-y-1">{t.email}<input required type="email" className={box} value={f.email} onChange={set("email")} /></label>
      <label className="text-xs space-y-1">{t.phone}<input className={box} value={f.phone} onChange={set("phone")} /></label>
      <label className="text-xs space-y-1">{t.website}<input className={box} value={f.website} onChange={set("website")} /></label>
      <label className="text-xs space-y-1">{t.instagram}<input className={box} value={f.instagram} onChange={set("instagram")} /></label>
      <label className="text-xs space-y-1 sm:col-span-2">{t.country}<input className={box} value={f.country} onChange={set("country")} /></label>
      <fieldset className="sm:col-span-2 text-xs space-y-2">
        <legend className="mb-1">{x.categories}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {BRAND_PRODUCT_CATEGORIES.map((c) => (
            <label key={c} className="inline-flex items-center gap-2">
              <input type="checkbox" checked={f.productCategories.includes(c)} onChange={() => toggleCategory(c)} />
              {x.cat[c]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="text-xs space-y-1 sm:col-span-2">{x.markets}<input className={box} value={f.currentMarkets} onChange={set("currentMarkets")} /></label>
      <label className="text-xs space-y-1">
        {x.presence}
        <select className={box} value={f.wholesalePresence} onChange={set("wholesalePresence")}>
          <option value="">{x.choose}</option>
          {BRAND_WHOLESALE_PRESENCE.map((v) => <option key={v} value={v}>{x.pres[v]}</option>)}
        </select>
      </label>
      <label className="text-xs space-y-1">
        {x.opportunity}
        <select className={box} value={f.opportunityType} onChange={set("opportunityType")}>
          <option value="">{x.choose}</option>
          {BRAND_OPPORTUNITY_TYPES.map((v) => <option key={v} value={v}>{x.opp[v]}</option>)}
        </select>
      </label>
      <label className="text-xs space-y-1 sm:col-span-2">{t.message}<textarea rows={5} className={box} value={f.message} onChange={set("message")} /></label>
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.company2} onChange={set("company2")} />
      {(state === "invalid" || state === "failed") && <p role="alert" className="sm:col-span-2 text-xs text-accent font-medium">{state === "invalid" ? t.invalid : t.failed}</p>}
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="btn-primary px-8 py-3.5 text-xs uppercase tracking-[0.2em] font-semibold disabled:opacity-50">{t.send}</button>
      </div>
    </form>
  );
}
