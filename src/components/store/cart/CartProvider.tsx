"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import { quoteCartAction } from "@/app/(store)/cart/actions";
import type { CartQuote } from "@/features/cart/quote";
import { MAX_LINE_QUANTITY, type CartInput } from "@/features/cart/schemas";
import { CART_STORAGE_KEY, EMPTY_CART, cartStore } from "./cart-storage";

type CartContextValue = {
  /** Σ stored quantities: updates the header badge before the server confirms. */
  itemCount: number;
  /** The last server quote; null while the cart is empty or not loaded yet. */
  quote: CartQuote | null;
  /** "loading" until hydration and, when the stored cart has lines, until the first quote arrives. */
  status: "loading" | "ready";
  /** A quote is in flight after a change. */
  pending: boolean;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  addItem: (variantId: number, quantity: number) => void;
  setQuantity: (variantId: number, quantity: number) => void;
  removeItem: (variantId: number) => void;
  applyCoupon: (code: string) => void;
  removeCoupon: () => void;
  /** Checkout: the phone goes with every quote so a coupon's per-customer limit is checked early. */
  setCustomerPhone: (phone: string | null) => void;
  /** Re-quotes the stored cart, e.g. after the server refused an order because stock changed. */
  refresh: () => void;
  /** After a successful order. */
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

/** Sets one line's quantity in place (0 removes it); a new variant goes at the end. */
function withLine(cart: CartInput, variantId: number, quantity: number): CartInput {
  const next = { variantId, quantity: Math.min(MAX_LINE_QUANTITY, quantity) };
  const exists = cart.lines.some((line) => line.variantId === variantId);
  const lines = exists
    ? cart.lines.flatMap((line) => (line.variantId !== variantId ? [line] : quantity > 0 ? [next] : []))
    : quantity > 0
      ? [...cart.lines, next]
      : cart.lines;
  return { lines, couponCode: lines.length > 0 ? cart.couponCode : null };
}

const subscribeToNothing = () => () => {};

/**
 * The browser-side cart (ARCHITECTURE.md §4.1): storage holds ids, quantities and a coupon code;
 * every change is written locally, then sent to the quote action, whose reply (the reconciled
 * lines, the code only while it applies, and every amount) replaces both storage and the view.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const stored = useSyncExternalStore(cartStore.subscribe, cartStore.get, cartStore.getServerSnapshot);
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const requestRef = useRef(0);
  const phoneRef = useRef<string | null>(null);

  /** Sends a non-empty cart to the server; the reply replaces storage and the view. */
  const quoteRemote = useCallback((cart: CartInput) => {
    const requestId = ++requestRef.current;
    startTransition(async () => {
      const result = await quoteCartAction({ ...cart, phone: phoneRef.current });
      if (requestId !== requestRef.current) return; // a newer change is already in flight
      if (result.ok) {
        cartStore.set({ lines: result.quote.storedLines, couponCode: result.quote.storedCouponCode });
        setQuote(result.quote);
      } else {
        cartStore.set(EMPTY_CART);
        setQuote(null);
      }
    });
  }, []);

  /** A change made here: store it at once, then quote it. */
  const runQuote = useCallback(
    (cart: CartInput) => {
      cartStore.set(cart);
      if (cart.lines.length > 0) {
        quoteRemote(cart);
      } else {
        requestRef.current += 1;
        setQuote(null);
      }
    },
    [quoteRemote],
  );

  useEffect(() => {
    const cart = cartStore.get();
    if (cart.lines.length > 0) quoteRemote(cart);
    // Another tab changed the cart: pick it up.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== CART_STORAGE_KEY) return;
      const changed = cartStore.reload();
      if (changed.lines.length > 0) quoteRemote(changed);
      else setQuote(null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [quoteRemote]);

  // Stable, so the drawer's effects (focus, scroll lock, Escape) don't re-run on every quote.
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const value: CartContextValue = {
    itemCount: stored.lines.reduce((sum, line) => sum + line.quantity, 0),
    quote,
    status: !hydrated || (stored.lines.length > 0 && quote === null) ? "loading" : "ready",
    pending,
    drawerOpen,
    openDrawer,
    closeDrawer,
    addItem: (variantId, quantity) => {
      const cart = cartStore.get();
      const current = cart.lines.find((line) => line.variantId === variantId)?.quantity ?? 0;
      runQuote(withLine(cart, variantId, current + quantity));
      setDrawerOpen(true);
    },
    setQuantity: (variantId, quantity) => runQuote(withLine(cartStore.get(), variantId, quantity)),
    removeItem: (variantId) => runQuote(withLine(cartStore.get(), variantId, 0)),
    applyCoupon: (code) => runQuote({ ...cartStore.get(), couponCode: code.trim() || null }),
    removeCoupon: () => runQuote({ ...cartStore.get(), couponCode: null }),
    setCustomerPhone: (phone) => {
      const next = phone?.trim() || null;
      if (next === phoneRef.current) return;
      phoneRef.current = next;
      // Only a stored coupon can be affected by the phone, so nothing else triggers a round trip.
      const cart = cartStore.get();
      if (cart.couponCode && cart.lines.length > 0) quoteRemote(cart);
    },
    refresh: () => {
      const cart = cartStore.get();
      if (cart.lines.length > 0) quoteRemote(cart);
    },
    clearCart: () => runQuote(EMPTY_CART),
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
