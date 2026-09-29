import { cache } from "react";
import { features } from "@/config/features";
import { getCouponByCode } from "@/features/coupons/repo";
import { getEnabledDiscountsWithTargets } from "@/features/discounts/repo";
import { decimalToPaisa, type Paisa } from "./money";
import {
  calculateCart,
  normalizeCouponCode,
  priceVariant,
  type CartCalculation,
  type CartLineInput,
  type PricingCoupon,
  type PricingDiscount,
  type PricingProduct,
  type PricingZone,
  type VariantPrice,
} from "./pricing";

const flags = { coupons: features.coupons, cod: features.cod };

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

async function loadCoupon(couponCode: string | null): Promise<PricingCoupon | null> {
  if (!features.coupons || couponCode === null) return null;
  const row = await getCouponByCode(normalizeCouponCode(couponCode));
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: decimalToPaisa(row.value),
    minOrder: row.minOrder === null ? null : decimalToPaisa(row.minOrder),
    maxDiscount: row.maxDiscount === null ? null : decimalToPaisa(row.maxDiscount),
    usageLimit: row.usageLimit,
    usedCount: row.usedCount,
    isActive: row.isActive,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  };
}

/**
 * Prices a whole cart: loads the discounts and the coupon row, then runs the pure rules. The
 * cart quote (S6) and `createOrder` (S7) both go through here (ARCHITECTURE.md §4.1). `zone`
 * and `country` are null until checkout knows the address, so shipping stays pending.
 */
export async function priceCart(input: {
  lines: CartLineInput[];
  couponCode: string | null;
  zone: PricingZone | null;
  country: string | null;
}): Promise<CartCalculation> {
  const [discounts, coupon] = await Promise.all([getDiscounts(), loadCoupon(input.couponCode)]);
  return calculateCart({
    lines: input.lines,
    discounts,
    couponCode: input.couponCode,
    coupon,
    zone: input.zone,
    country: input.country,
    flags,
    now: new Date(),
  });
}
