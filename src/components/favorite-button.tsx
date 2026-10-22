"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getFavoriteState, toggleFavorite, type FavoriteState } from "@/lib/buyer-actions";

/**
 * Heart button (product card + product page). One lightweight lookup per
 * page load is shared by every heart; it renders nothing for signed-out
 * visitors (favorites are for signed-in buyers).
 */
let cached: { at: number; promise: Promise<FavoriteState> } | null = null;

function loadState(): Promise<FavoriteState> {
  if (!cached || Date.now() - cached.at > 15000) {
    cached = { at: Date.now(), promise: getFavoriteState().catch(() => ({ loggedIn: false, ids: [] })) };
  }
  return cached.promise;
}

function remember(productId: string, favorited: boolean) {
  if (!cached) return;
  cached = {
    at: cached.at,
    promise: cached.promise.then((s) => ({
      ...s,
      ids: favorited ? [...new Set([...s.ids, productId])] : s.ids.filter((id) => id !== productId),
    })),
  };
}

export function FavoriteButton({
  productId,
  variant = "icon",
  className = "",
}: {
  productId: string;
  variant?: "icon" | "label";
  className?: string;
}) {
  const t = useTranslations("c2.favorites");
  const [state, setState] = useState<{ loggedIn: boolean; on: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadState().then((s) => {
      if (alive) setState({ loggedIn: s.loggedIn, on: s.ids.includes(productId) });
    });
    return () => {
      alive = false;
    };
  }, [productId]);

  if (!state?.loggedIn) return null;

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy || !state) return;
    setBusy(true);
    setFailed(false);
    const next = !state.on;
    setState({ ...state, on: next });
    const res = await toggleFavorite(productId);
    setBusy(false);
    if (res.error) {
      setState({ ...state, on: !next });
      setFailed(true);
    } else {
      remember(productId, Boolean(res.favorited));
    }
  }

  const heart = (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill={state.on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.4 5 6.5 5c1.9 0 3.5 1 4.5 2.6C12 6 13.6 5 15.5 5c3.1 0 5 3 3.8 6.3-1.8 4.6-7.3 9.2-7.3 9.2z" />
    </svg>
  );

  if (variant === "label") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={state.on}
        className={`inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-semibold hover:text-accent transition-colors ${className}`}
      >
        {heart}
        {failed ? t("failed") : state.on ? t("remove") : t("add")}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={state.on}
      aria-label={state.on ? t("remove") : t("add")}
      title={failed ? t("failed") : state.on ? t("remove") : t("add")}
      className={`w-8 h-8 flex items-center justify-center bg-background/90 backdrop-blur-sm border border-border/80 hover:text-accent transition-colors ${className}`}
    >
      {heart}
    </button>
  );
}
