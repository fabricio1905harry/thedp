"use client";

import { useSyncExternalStore } from "react";
import { Link } from "@/i18n/navigation";

const KEY = "tdp_cookie_ok";
const EVENT = "tdp-cookie-change";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

/** "1" = all cookies accepted, "essential" = non-essential cookies refused (P36). Either answer hides the notice. */
export type CookieChoice = "1" | "essential";

function readAccepted() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "1" || v === "essential";
  } catch {
    return false;
  }
}

function choose(value: CookieChoice) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // storage blocked: the notice just returns next visit
  }
  window.dispatchEvent(new Event(EVENT));
}

/** First-visit cookie notice (texts edited in Admin → Conteúdo → Barras do site). */
export function CookieNotice({ text, accept, reject, linkLabel, link }: { text: string; accept: string; reject?: string; linkLabel: string; link: string }) {
  // server snapshot = "accepted" so nothing is rendered (or hydrated) until the browser says otherwise
  const accepted = useSyncExternalStore(subscribe, readAccepted, () => true);
  if (accepted || !text) return null;

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
        <div className="flex flex-wrap gap-2 shrink-0">
          {reject && (
            <button type="button" onClick={() => choose("essential")} className="border border-foreground px-5 py-2 text-[11px] uppercase tracking-[0.2em] font-semibold">
              {reject}
            </button>
          )}
          <button type="button" onClick={() => choose("1")} className="btn-primary px-5 py-2 text-[11px] uppercase tracking-[0.2em] font-semibold">
            {accept}
          </button>
        </div>
      </div>
    </div>
  );
}
