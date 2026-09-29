/**
 * Pure price rules (ARCHITECTURE.md §4.1): plain data in, plain data out, no DB or I/O, so every
 * rule is unit-tested without a database. `service.ts` loads the data and calls these. Coupons,
 * shipping and the cart total arrive in S6 on top of `priceVariant`.
 */
import type { Paisa } from "./money";

export type PricingDiscount = {
  id: number;
  type: "percent" | "fixed";
  /** The DECIMAL value × 100: paisa for "fixed", hundredths of a percent for "percent" (10% = 1000). */
  value: number;
  targetType: "all" | "category" | "product";
  /** Product or category ids, depending on `targetType`; ignored for "all". */
  targetIds: number[];
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
};

/** What the discount lookup needs from a product (discounts never target a single variant). */
export type PricingProduct = {
  id: number;
  price: Paisa;
  categoryId: number;
  parentCategoryId: number | null;
};

export type VariantPrice = {
  /** The variant's own price before any discount. */
  basePrice: Paisa;
  /** What the customer pays per unit. Equal to `basePrice` when no discount applies. */
  unitPrice: Paisa;
  /** The winning discount, or null when nothing lowered the price. */
  discountId: number | null;
};

/** A variant's price override wins over the product price, even when the override is 0. */
export function variantBasePrice(productPrice: Paisa, priceOverride: Paisa | null): Paisa {
  return priceOverride ?? productPrice;
}

/** Active when switched on and `starts_at <= now < ends_at`; a null bound is open. */
export function isDiscountActive(discount: PricingDiscount, now: Date): boolean {
  if (!discount.isActive) return false;
  if (discount.startsAt && discount.startsAt.getTime() > now.getTime()) return false;
  if (discount.endsAt && discount.endsAt.getTime() <= now.getTime()) return false;
  return true;
}

/** A category discount matches the product's own category or that category's parent. */
export function discountMatchesProduct(discount: PricingDiscount, product: PricingProduct): boolean {
  switch (discount.targetType) {
    case "all":
      return true;
    case "product":
      return discount.targetIds.includes(product.id);
    case "category":
      return (
        discount.targetIds.includes(product.categoryId) ||
        (product.parentCategoryId !== null && discount.targetIds.includes(product.parentCategoryId))
      );
  }
}

/**
 * The unit price after one discount. A percentage's amount is rounded to whole rupees, half up
 * (client decision C3). A fixed amount is per unit. Neither can take the price below 0.
 */
export function applyDiscount(basePrice: Paisa, discount: PricingDiscount): Paisa {
  if (discount.type === "fixed") return Math.max(0, basePrice - discount.value);

  // basePrice × value is an exact integer (paisa × hundredths of a percent), and its quotient
  // by 1,000,000 is whole rupees; Math.round is half up for these non-negative amounts.
  const discountRupees = Math.round((basePrice * discount.value) / 1_000_000);
  return Math.max(0, basePrice - discountRupees * 100);
}

/**
 * Prices one variant. Among the active discounts that match its product, the single one giving
 * the lowest unit price wins (ties go to the lowest discount id); discounts never stack. The
 * choice is made against this variant's own base price.
 */
export function priceVariant(
  product: PricingProduct,
  priceOverride: Paisa | null,
  discounts: PricingDiscount[],
  now: Date,
): VariantPrice {
  const basePrice = variantBasePrice(product.price, priceOverride);
  let best: VariantPrice = { basePrice, unitPrice: basePrice, discountId: null };

  for (const discount of discounts) {
    if (!isDiscountActive(discount, now) || !discountMatchesProduct(discount, product)) continue;
    const unitPrice = applyDiscount(basePrice, discount);
    if (unitPrice >= basePrice) continue;

    const isLower = unitPrice < best.unitPrice;
    const isTieWithLowerId = unitPrice === best.unitPrice && best.discountId !== null && discount.id < best.discountId;
    if (isLower || isTieWithLowerId) best = { basePrice, unitPrice, discountId: discount.id };
  }
  return best;
}

/** Whole-percent saving for the discount badge, e.g. 2400 -> 2160 is 10. */
export function percentOff(price: VariantPrice): number {
  if (price.basePrice <= 0 || price.unitPrice >= price.basePrice) return 0;
  return Math.round(((price.basePrice - price.unitPrice) * 100) / price.basePrice);
}
