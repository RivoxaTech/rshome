"use client";

import { useState } from "react";
import { Button } from "@/components/store/Button";
import { useCart } from "@/components/store/cart/CartProvider";
import { DiscountBadge, PriceTag } from "@/components/store/catalog/PriceTag";
import { QuantityStepper } from "@/components/store/QuantityStepper";
import type { VariantOption } from "@/features/catalog/service";

/**
 * Variant picker, price, stock state, quantity and Add to Cart. Every variant arrives already
 * priced by the server; this only chooses which one to show (CLAUDE.md #5).
 */
export function ProductPurchase({ optionName, variants }: { optionName: string; variants: VariantOption[] }) {
  const { addItem } = useCart();
  const [selectedId, setSelectedId] = useState(
    () => (variants.find((variant) => variant.stockState !== "sold_out") ?? variants[0]).id,
  );
  const [quantity, setQuantity] = useState(1);

  const selected = variants.find((variant) => variant.id === selectedId) ?? variants[0];
  const soldOut = selected.stockState === "sold_out";
  const maxQuantity = Math.max(1, selected.stock);
  // Switching to a variant with less stock caps the quantity instead of resetting it.
  const shownQuantity = Math.min(quantity, maxQuantity);

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-4">
        <PriceTag price={selected.price} className="text-lg tracking-widest" />
        {selected.price.badge && <DiscountBadge label={selected.price.badge} />}
      </div>

      {variants.length > 1 && (
        <fieldset className="mt-10">
          <legend className="eyebrow">{optionName}</legend>
          <div className="mt-4 flex flex-wrap gap-2">
            {variants.map((variant) => {
              const active = variant.id === selected.id;
              return (
                <button
                  key={variant.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedId(variant.id)}
                  className={`min-w-16 border px-5 py-3 text-[11px] tracking-[0.22em] uppercase transition-colors duration-500 ${
                    active ? "bg-espresso border-espresso text-background" : "border-espresso/30 hover:border-espresso"
                  } ${variant.stockState === "sold_out" ? "line-through decoration-1" : ""}`}
                >
                  {variant.label}
                  {variant.stockState === "sold_out" && <span className="sr-only"> (sold out)</span>}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <p aria-live="polite" className={`mt-6 text-xs tracking-widest ${soldOut ? "text-destructive" : "text-muted-foreground"}`}>
        {soldOut ? "Sold out" : selected.stockState === "low_stock" ? `Only ${selected.stock} left` : "In stock"}
      </p>

      <div className="mt-6 flex flex-wrap gap-4">
        <QuantityStepper value={soldOut ? 0 : shownQuantity} min={soldOut ? 0 : 1} max={maxQuantity} disabled={soldOut} onChange={setQuantity} />
        <div className="grid min-w-48 flex-1">
          <Button disabled={soldOut} onClick={() => addItem(selected.id, shownQuantity)}>
            {soldOut ? "Sold out" : "Add to Cart"}
          </Button>
        </div>
      </div>
    </div>
  );
}
