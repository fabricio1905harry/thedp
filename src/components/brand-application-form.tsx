"use client";

import { useState, useTransition } from "react";
import { useLocale } from "next-intl";
import { submitBrandApplication } from "@/app/[locale]/seja-uma-marca/actions";

const T = {
  en: { brand: "Brand name", name: "Your name", email: "E-mail", phone: "Phone / WhatsApp", website: "Website", instagram: "Instagram", country: "Country", message: "Tell us about your brand", send: "SEND APPLICATION", ok: "Thank you! Our team will review your application and get back to you.", invalid: "Please fill in the brand name, your name and a valid e-mail.", failed: "Could not send. Please try again." },
  es: { brand: "Nombre de la marca", name: "Tu nombre", email: "Correo", phone: "Teléfono / WhatsApp", website: "Sitio web", instagram: "Instagram", country: "País", message: "Cuéntanos sobre tu marca", send: "ENVIAR SOLICITUD", ok: "¡Gracias! Nuestro equipo revisará tu solicitud y te responderá.", invalid: "Completa el nombre de la marca, tu nombre y un correo válido.", failed: "No se pudo enviar. Inténtalo de nuevo." },
  pt: { brand: "Nome da marca", name: "Seu nome", email: "E-mail", phone: "Telefone / WhatsApp", website: "Site", instagram: "Instagram", country: "País", message: "Conte sobre a sua marca", send: "ENVIAR CANDIDATURA", ok: "Obrigado! Nossa equipe vai analisar sua candidatura e retornar.", invalid: "Preencha o nome da marca, seu nome e um e-mail válido.", failed: "Não foi possível enviar. Tente novamente." },
} as const;

export function BrandApplicationForm() {
  const locale = useLocale();
  const t = T[(locale in T ? locale : "en") as keyof typeof T];
  const [f, setF] = useState({ brandName: "", contactName: "", email: "", phone: "", website: "", instagram: "", country: "", message: "", company2: "" });
  const [state, setState] = useState<"idle" | "ok" | "invalid" | "failed">("idle");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
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
      <label className="text-xs space-y-1 sm:col-span-2">{t.message}<textarea rows={5} className={box} value={f.message} onChange={set("message")} /></label>
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.company2} onChange={set("company2")} />
      {(state === "invalid" || state === "failed") && <p role="alert" className="sm:col-span-2 text-xs text-accent font-medium">{state === "invalid" ? t.invalid : t.failed}</p>}
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="btn-primary px-8 py-3.5 text-xs uppercase tracking-[0.2em] font-semibold disabled:opacity-50">{t.send}</button>
      </div>
    </form>
  );
}
