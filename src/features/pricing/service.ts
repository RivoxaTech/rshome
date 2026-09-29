import { cache } from "react";
import { features } from "@/config/features";
import { countCouponUsagesByCustomer, getCouponByCode, type CouponRow } from "@/features/coupons/repo";
import { getEnabledDiscountsWithTargets } from "@/features/discounts/repo";
import { db, type DbClient } from "@/server/db/client";
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

function toPricingCoupon(row: CouponRow, customerUsedCount: number | null): PricingCoupon {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: decimalToPaisa(row.value),
    minOrder: row.minOrder === null ? null : decimalToPaisa(row.minOrder),
    maxDiscount: row.maxDiscount === null ? null : decimalToPaisa(row.maxDiscount),
    usageLimit: row.usageLimit,
    usedCount: row.usedCount,
    perCustomerLimit: row.perCustomerLimit,
    customerUsedCount,
    isActive: row.isActive,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  };
}

/**
 * The coupon row behind a code, with this customer's usage count when the phone is known
 * (`customerKey`, normalised) and the coupon has a per-customer limit. `createOrder` passes its
 * transaction and `lock: true` so the row is read under `FOR UPDATE` (ARCHITECTURE.md §4.2).
 */
export async function loadCoupon(
  couponCode: string | null,
  customerKey: string | null,
  options: { db?: DbClient; lock?: boolean } = {},
): Promise<PricingCoupon | null> {
  if (!features.coupons || couponCode === null) return null;
  const dbc = options.db ?? db;
  const row = await getCouponByCode(normalizeCouponCode(couponCode), dbc, options.lock === true);
  if (!row) return null;
  const customerUsedCount =
    customerKey !== null && row.perCustomerLimit !== null ? await countCouponUsagesByCustomer(row.id, customerKey, dbc) : null;
  return toPricingCoupon(row, customerUsedCount);
}

/**
 * Prices a whole cart: loads the discounts, then runs the pure rules with the coupon the caller
 * loaded through `loadCoupon`. The cart quote (S6) and `createOrder` (S7) both go through here
 * (ARCHITECTURE.md §4.1). `zone` and `country` are null until checkout knows the address, so
 * shipping stays pending.
 */
export async function priceCart(input: {
  lines: CartLineInput[];
  couponCode: string | null;
  coupon: PricingCoupon | null;
  zone: PricingZone | null;
  country: string | null;
}): Promise<CartCalculation> {
  const discounts = await getDiscounts();
  return calculateCart({
    lines: input.lines,
    discounts,
    couponCode: input.couponCode,
    coupon: input.coupon,
    zone: input.zone,
    country: input.country,
    flags,
    now: new Date(),
  });
}
