"use client";

import { Button } from "@/components/store/Button";
import { CartLineItem } from "./CartLineItem";
import { CartNotices } from "./CartNotices";
import { useCart } from "./CartProvider";
import { CartSummary } from "./CartSummary";

/**
 * The /cart page body: lines on the left, totals on the right (stacked on phones). Coupon codes
 * are entered in the checkout summary (S7); here an applied coupon only appears as a totals row.
 */
export function CartPageContent({ deliveryNote }: { deliveryNote: string }) {
  const { quote, status, pending } = useCart();

  if (status === "loading") {
    return <p className="text-muted-foreground mt-12 text-sm">Loading your cart…</p>;
  }

  if (!quote || quote.lines.length === 0) {
    return (
      <div className="mt-12">
        {quote && <CartNotices notices={quote.notices} className="mb-8 max-w-xl" />}
        <p className="text-muted-foreground text-sm">Your cart is empty.</p>
        <div className="mt-8">
          <Button href="/shop">Continue shopping</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 grid gap-12 lg:grid-cols-[1fr_380px] lg:gap-20">
      <div>
        <CartNotices notices={quote.notices} className="mb-4" />
        <ul className="divide-border border-border divide-y border-t">
          {quote.lines.map((line) => (
            <CartLineItem key={line.variantId} line={line} />
          ))}
        </ul>
        <div className="mt-8">
          <Button href="/shop" variant="ghost">
            Continue shopping
          </Button>
        </div>
      </div>

      <aside className="bg-card h-fit p-6 lg:p-8">
        <p className="eyebrow">Summary</p>
        <div className="mt-6">
          <CartSummary quote={quote} deliveryNote={deliveryNote} pending={pending} />
        </div>
        <div className="mt-8 grid">
          <Button href="/checkout">Checkout</Button>
        </div>
      </aside>
    </div>
  );
}
