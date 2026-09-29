import { cartInputSchema, type CartInput } from "@/features/cart/schemas";

/** Only ids, quantities and a coupon code live in the browser (ARCHITECTURE.md §4.1), never prices. */
export const CART_STORAGE_KEY = "cart.v1";

export const EMPTY_CART: CartInput = { lines: [], couponCode: null };

/** Anything unreadable (old shape, tampered, private mode) is treated as an empty cart. */
function readStoredCart(): CartInput {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return EMPTY_CART;
    const parsed = cartInputSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY_CART;
  } catch {
    return EMPTY_CART;
  }
}

function writeStoredCart(cart: CartInput): void {
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch {
    // Storage full or blocked: the cart still works for this page view.
  }
}

let current: CartInput | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/**
 * The stored cart as an external store for `useSyncExternalStore`: read lazily from
 * localStorage on the first client access, written through on every change.
 */
export const cartStore = {
  get(): CartInput {
    if (current === null) current = readStoredCart();
    return current;
  },
  /** The server has no storage; hydration starts from an empty cart and the client fills it in. */
  getServerSnapshot(): CartInput {
    return EMPTY_CART;
  },
  set(cart: CartInput): void {
    current = cart;
    writeStoredCart(cart);
    notify();
  },
  /** Re-reads storage after another tab changed it (the `storage` event). */
  reload(): CartInput {
    current = readStoredCart();
    notify();
    return current;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
