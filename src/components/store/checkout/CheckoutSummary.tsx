"use client";

import Image from "next/image";
import { Button } from "@/components/store/Button";
import { CartNotices } from "@/components/store/cart/CartNotices";
import { CartSummary } from "@/components/store/cart/CartSummary";
import { CouponForm } from "@/components/store/cart/CouponForm";
import type { CartQuote } from "@/features/cart/quote";

/**
 * The checkout's order summary: the lines as the server priced them, the coupon field (owner
 * decision, S6: it lives here, not in the cart), the totals and the Place order button, which
 * submits the details form beside it by id.
 */
export function CheckoutSummary({
  quote,
  pending,
  submitting,
  couponsEnabled,
  deliveryNote,
  formId,
  error,
}: {
  quote: CartQuote;
  pending: boolean;
  submitting: boolean;
  couponsEnabled: boolean;
  deliveryNote: string;
  formId: string;
  error: string | null;
}) {
  return (
    <aside className="bg-card h-fit p-6 lg:p-8">
      <p className="eyebrow">Order summary</p>
      <CartNotices notices={quote.notices} className="mt-4" />

      <ul className="divide-border mt-4 divide-y">
        {quote.lines.map((line) => (
          <li key={line.variantId} className="flex items-start gap-4 py-4">
            <div className="bg-muted h-20 w-16 shrink-0 overflow-hidden">
              {line.image && (
                <Image
                  src={line.image.path}
                  alt={line.image.alt ?? line.name}
                  width={line.image.width}
                  height={line.image.height}
                  sizes="64px"
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-serif text-lg leading-tight">{line.name}</p>
              <p className="text-muted-foreground mt-1 text-[10px] tracking-[0.28em] uppercase">
                {line.variantLabel && <span>{line.variantLabel} · </span>}Qty {line.quantity}
              </p>
            </div>
            <p className="shrink-0 text-xs tracking-widest">{line.lineTotal}</p>
          </li>
        ))}
      </ul>

      {couponsEnabled && (
        <div className="border-border mt-2 border-t pt-6">
          <CouponForm coupon={quote.coupon} />
        </div>
      )}

      <div className="border-border mt-6 border-t pt-6">
        <CartSummary quote={quote} deliveryNote={deliveryNote} pending={pending} />
      </div>

      {error && (
        <p role="alert" className="border-destructive text-destructive mt-6 border-l-2 pl-4 text-xs leading-relaxed">
          {error}
        </p>
      )}

      <div className="mt-8 grid">
        <Button type="submit" form={formId} disabled={pending || submitting}>
          {submitting ? "Placing your order…" : "Place order"}
        </Button>
      </div>
    </aside>
  );
}
