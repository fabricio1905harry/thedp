"use client";

import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { ProductPricing } from "@/lib/types";

export interface CartItem {
  variantId: string;
  productSlug: string;
  title: string;
  color: string;
  size: string;
  pricing: ProductPricing;
  qty: number;
}

interface CartContextValue {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "qty">, qty?: number) => void;
  removeItem: (variantId: string) => void;
  setQty: (variantId: string, qty: number) => void;
  clear: () => void;
  count: number;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "thedress_cart_v2";
const EMPTY: CartItem[] = [];

// Tiny external store so the cart survives page navigation/reload without a
// hydration mismatch: SSR and the first client render both see `EMPTY`,
// then useSyncExternalStore swaps in the real localStorage value post-mount.
let cartState: CartItem[] = EMPTY;
let storeInitialized = false;
const listeners = new Set<() => void>();

function loadFromStorage(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

function setCartState(next: CartItem[]) {
  cartState = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode, quota) — in-memory state still works
  }
  listeners.forEach((l) => l());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): CartItem[] {
  if (!storeInitialized) {
    cartState = loadFromStorage();
    storeInitialized = true;
  }
  return cartState;
}

function getServerSnapshot(): CartItem[] {
  return EMPTY;
}

function addItem(item: Omit<CartItem, "qty">, qty = 1) {
  const prev = getSnapshot();
  const existing = prev.find((i) => i.variantId === item.variantId);
  setCartState(
    existing
      ? prev.map((i) => (i.variantId === item.variantId ? { ...i, qty: i.qty + qty } : i))
      : [...prev, { ...item, qty }]
  );
}

function removeItem(variantId: string) {
  setCartState(getSnapshot().filter((i) => i.variantId !== variantId));
}

function setQty(variantId: string, qty: number) {
  if (qty <= 0) return removeItem(variantId);
  setCartState(getSnapshot().map((i) => (i.variantId === variantId ? { ...i, qty } : i)));
}

function clear() {
  setCartState([]);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const count = items.reduce((sum, i) => sum + i.qty, 0);

  const value = useMemo(
    () => ({ items, addItem, removeItem, setQty, clear, count }),
    [items, count]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
