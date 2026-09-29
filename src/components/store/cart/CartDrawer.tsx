"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/store/Button";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import { CartLineItem } from "./CartLineItem";
import { CartNotices } from "./CartNotices";
import { useCart } from "./CartProvider";
import { CartSummary } from "./CartSummary";

/**
 * Slide-out cart, opened by the header icon and by Add to Cart. Overlay and panel follow the
 * demo's product modal (bg-espresso/50 backdrop-blur, bg-background shadow-lift).
 */
export function CartDrawer({ deliveryNote }: { deliveryNote: string }) {
  const { drawerOpen, closeDrawer, quote, status, pending } = useCart();
  const closeRef = useRef<HTMLButtonElement>(null);
  const hasLines = quote !== null && quote.lines.length > 0;

  useEffect(() => {
    if (!drawerOpen) return;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen, closeDrawer]);

  return (
    <div className={`fixed inset-0 z-[60] ${drawerOpen ? "" : "pointer-events-none"}`} aria-hidden={!drawerOpen}>
      <div
        onClick={closeDrawer}
        className={`bg-espresso/50 absolute inset-0 backdrop-blur-sm transition-opacity duration-500 ${
          drawerOpen ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Your cart"
        className={`bg-background shadow-lift absolute inset-y-0 right-0 flex w-full max-w-md flex-col transition-[transform,visibility] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          drawerOpen ? "visible translate-x-0" : "invisible translate-x-full"
        }`}
      >
        <div className="border-border flex items-center justify-between border-b px-6 py-5">
          <p className="eyebrow">Your cart</p>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close cart"
            onClick={closeDrawer}
            className="hover:text-champagne -mr-2 p-2 transition-colors"
          >
            <Icon d={ICON_PATHS.close} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6">
          {status === "loading" ? (
            <p className="text-muted-foreground py-16 text-center text-sm">Loading your cart…</p>
          ) : !hasLines ? (
            <div className="py-16 text-center">
              {quote && <CartNotices notices={quote.notices} className="mb-8 text-left" />}
              <p className="font-serif text-2xl">Your cart is empty.</p>
              <div className="mt-8">
                <Button href="/shop" variant="outline" onClick={closeDrawer}>
                  Continue shopping
                </Button>
              </div>
            </div>
          ) : (
            <>
              <CartNotices notices={quote.notices} className="mt-6" />
              <ul className="divide-border divide-y">
                {quote.lines.map((line) => (
                  <CartLineItem key={line.variantId} line={line} onNavigate={closeDrawer} />
                ))}
              </ul>
            </>
          )}
        </div>

        {hasLines && (
          <div className="border-border border-t px-6 py-6">
            <CartSummary quote={quote} pending={pending} />
            <p className="text-muted-foreground mt-3 text-xs leading-relaxed">{deliveryNote}</p>
            <div className="mt-6 grid gap-3">
              <Button href="/checkout" onClick={closeDrawer}>
                Checkout
              </Button>
              <Button href="/cart" variant="outline" onClick={closeDrawer}>
                View cart
              </Button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
