import { cache } from "react";
import { features } from "@/config/features";
import { getEnabledDiscountsWithTargets } from "@/features/discounts/repo";
import { decimalToPaisa, type Paisa } from "./money";
import { priceVariant, type PricingDiscount, type PricingProduct, type VariantPrice } from "./pricing";

/** Loaded once per request (React cache()) however many products the page prices. */
const getDiscounts = cache(async (): Promise<PricingDiscount[]> => {
  if (!features.discounts) return [];
  const rows = await getEnabledDiscountsWithTargets();
  return rows.map(({ discount, targetIds }) => ({
    id: discount.id,
    type: discount.type,
    value: decimalToPaisa(discount.value),
    targetType: discount.targetType,
    targetIds,
    isActive: discount.isActive,
    startsAt: discount.startsAt,
    endsAt: discount.endsAt,
  }));
});

export type VariantPricer = (product: PricingProduct, priceOverride: Paisa | null) => VariantPrice;

/**
 * Returns a function that prices variants with this request's discounts and a single `now`,
 * so every price on a page is computed against the same moment.
 */
export async function getVariantPricer(): Promise<VariantPricer> {
  const discounts = await getDiscounts();
  const now = new Date();
  return (product, priceOverride) => priceVariant(product, priceOverride, discounts, now);
}
