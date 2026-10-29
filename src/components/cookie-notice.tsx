"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";

const KEY = "tdp_cookie_ok";

/** First-visit cookie notice (texts edited in Admin → Conteúdo → Barras do site). */
export function CookieNotice({ text, accept, linkLabel, link }: { text: string; accept: string; linkLabel: string; link: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible || !text) return null;

  return (
    <div role="dialog" aria-label="Cookies" className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-background px-4 py-3 shadow-lg">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3 text-xs">
        <p className="flex-1 text-muted leading-relaxed">
          {text}{" "}
          {link && linkLabel && (
            <Link href={link} className="underline text-foreground">
              {linkLabel}
            </Link>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(KEY, "1");
            } catch {
              // storage blocked: the notice just returns next visit
            }
            setVisible(false);
          }}
          className="btn-primary px-5 py-2 text-[11px] uppercase tracking-[0.2em] font-semibold shrink-0"
        >
          {accept}
        </button>
      </div>
    </div>
  );
}
