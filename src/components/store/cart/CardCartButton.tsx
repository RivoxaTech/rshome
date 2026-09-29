"use client";

import { Button } from "@/components/store/Button";
import type { ProductCard } from "@/features/catalog/service";
import { useCart } from "./CartProvider";

/**
 * The card's call to action: a single-variant product adds one unit directly; a product with
 * options links to its page, where the variant picker lives.
 */
export function CardCartButton({ card, fullWidth = false }: { card: ProductCard; fullWidth?: boolean }) {
  const { addItem } = useCart();

  if (!card.singleVariant) {
    return (
      <Button href={`/product/${card.slug}`} variant="outline" fullWidth={fullWidth}>
        Choose options
      </Button>
    );
  }

  const { id, soldOut } = card.singleVariant;
  return (
    <Button variant="outline" fullWidth={fullWidth} disabled={soldOut} onClick={() => addItem(id, 1)}>
      {soldOut ? "Sold out" : "Add to Cart"}
    </Button>
  );
}
