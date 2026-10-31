"use client";

import { useState, useTransition } from "react";
import { useLocale } from "next-intl";
import { subscribeNewsletter } from "@/app/[locale]/newsletter-actions";

/** "Stay in the know" form (texts edited in Admin → Conteúdo → Barras do site). */
export function NewsletterForm({
  title,
  text,
  placeholder,
  button,
  success,
}: {
  title: string;
  text: string;
  placeholder: string;
  button: string;
  success: string;
}) {
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "ok" | "error">("idle");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await subscribeNewsletter(email, locale);
      setState(res.ok ? "ok" : "error");
      if (res.ok) setEmail("");
    });
  }

  return (
    <div className="grid md:grid-cols-2 gap-4 items-center">
      <div>
        {title && <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em]">{title}</h3>}
        {text && <p className="mt-2 text-xs text-muted leading-relaxed max-w-md">{text}</p>}
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setState("idle");
          }}
          placeholder={placeholder}
          aria-label={placeholder || title}
          className="min-w-0 flex-1 border border-border bg-background px-3 py-2.5 text-sm"
        />
        <button type="submit" disabled={pending} className="btn-primary px-5 py-2.5 text-[11px] uppercase tracking-[0.2em] font-semibold disabled:opacity-50">
          {button}
        </button>
      </form>
      {state === "ok" && <p role="status" className="md:col-span-2 text-xs font-medium">{success}</p>}
      {state === "error" && <p role="alert" className="md:col-span-2 text-xs text-accent font-medium">!</p>}
    </div>
  );
}
