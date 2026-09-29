"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/store/Button";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import type { CartQuoteCoupon } from "@/features/cart/quote";
import { useCart } from "./CartProvider";

/**
 * Enter a code, or see the applied one with a remove control. The message comes from the
 * server. Lives in the checkout order summary (S7), not in the cart (owner decision, S6).
 */
export function CouponForm({ coupon }: { coupon: CartQuoteCoupon }) {
  const { pending, applyCoupon, removeCoupon } = useCart();
  const [code, setCode] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code.trim()) return;
    applyCoupon(code);
    setCode("");
  }

  if (coupon.status === "applied") {
    return (
      <div className="border-border flex items-center justify-between gap-4 border-b py-2 text-xs tracking-[0.2em] uppercase">
        <p>
          <span className="font-medium">{coupon.code}</span> applied
        </p>
        <button
          type="button"
          aria-label="Remove coupon"
          disabled={pending}
          onClick={removeCoupon}
          className="text-muted-foreground hover:text-destructive p-1.5 transition-colors disabled:opacity-40"
        >
          <Icon d={ICON_PATHS.trash} className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div className="border-espresso/30 focus-within:border-espresso flex items-center gap-3 border-b">
        <input
          type="text"
          name="coupon"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          maxLength={50}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="Coupon code"
          aria-label="Coupon code"
          className="placeholder:text-muted-foreground w-full bg-transparent py-3 text-sm tracking-widest uppercase outline-none"
        />
        <Button type="submit" variant="ghost" disabled={pending || !code.trim()}>
          Apply
        </Button>
      </div>
      {coupon.status === "rejected" && (
        <p role="alert" className="text-destructive text-xs leading-relaxed">
          {coupon.message}
        </p>
      )}
    </form>
  );
}
