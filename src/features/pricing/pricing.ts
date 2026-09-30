/**
 * Pure price rules (ARCHITECTURE.md §4.1): plain data in, plain data out, no DB or I/O, so every
 * rule is unit-tested without a database. `service.ts` loads the data and calls these.
 * `priceVariant` prices one variant (catalogue pages); `calculateCart` builds on it for the
 * cart quote and, later, `createOrder`.
 */
import { formatMoney, type Paisa } from "./money";

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
 * A percentage of an amount, rounded to whole rupees, half up (client decision C3). `value` is in
 * hundredths of a percent. amount × value is an exact integer and its quotient by 1,000,000 is
 * whole rupees; Math.round is half up for these non-negative amounts.
 */
export function percentAmount(amount: Paisa, value: number): Paisa {
  return Math.round((amount * value) / 1_000_000) * 100;
}

/**
 * The unit price after one discount. A percentage's amount is rounded to whole rupees, half up.
 * A fixed amount is per unit. Neither can take the price below 0.
 */
export function applyDiscount(basePrice: Paisa, discount: PricingDiscount): Paisa {
  const amount = discount.type === "fixed" ? discount.value : percentAmount(basePrice, discount.value);
  return Math.max(0, basePrice - amount);
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

/** A line is discounted when a discount lowered its unit price (the exclusivity rule's test). */
export function isDiscounted(price: VariantPrice): boolean {
  return price.unitPrice < price.basePrice;
}

// ---------------------------------------------------------------------------------------------
// Cart: coupons, shipping, COD and totals
// ---------------------------------------------------------------------------------------------

export type CartLineInput = {
  variantId: number;
  quantity: number;
  /** The variant's parent product, for the price fallback and the discount lookup. */
  product: PricingProduct;
  priceOverride: Paisa | null;
};

export type CartLine = {
  variantId: number;
  quantity: number;
  price: VariantPrice;
  /** unitPrice × quantity: what the customer pays for the line before any coupon. */
  lineTotal: Paisa;
  /** (basePrice − unitPrice) × quantity. */
  lineDiscount: Paisa;
};

export type PricingCoupon = {
  id: number;
  code: string;
  type: "percent" | "fixed";
  /** As for discounts: paisa for "fixed", hundredths of a percent for "percent". */
  value: number;
  minOrder: Paisa | null;
  maxDiscount: Paisa | null;
  usageLimit: number | null;
  usedCount: number;
  perCustomerLimit: number | null;
  /** This customer's past uses (by normalised phone), or null while the phone isn't known. */
  customerUsedCount: number | null;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
};

export type CouponRejectReason =
  | "COUPON_NOT_FOUND"
  | "COUPON_INACTIVE"
  | "COUPON_NOT_STARTED"
  | "COUPON_EXPIRED"
  | "COUPON_USAGE_LIMIT"
  | "COUPON_PER_CUSTOMER_LIMIT"
  | "COUPON_BLOCKED_BY_DISCOUNT"
  | "COUPON_MIN_ORDER";

export type CouponResult =
  | { status: "none" }
  | { status: "applied"; couponId: number; code: string; discount: Paisa }
  | { status: "rejected"; code: string; reason: CouponRejectReason; message: string };

const COUPON_MESSAGES: Record<Exclude<CouponRejectReason, "COUPON_MIN_ORDER">, string> = {
  COUPON_NOT_FOUND: "This coupon code is not valid.",
  COUPON_INACTIVE: "This coupon is no longer active.",
  COUPON_NOT_STARTED: "This coupon is not valid yet.",
  COUPON_EXPIRED: "This coupon has expired.",
  COUPON_USAGE_LIMIT: "This coupon has reached its usage limit.",
  COUPON_PER_CUSTOMER_LIMIT: "You have already used this coupon.",
  COUPON_BLOCKED_BY_DISCOUNT: "Coupons cannot be combined with discounted items.",
};

/** Coupon codes are case-insensitive and stored uppercase (DATABASE.md). */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Checks a coupon against the cart and returns its discount. Order of checks: the code exists,
 * is switched on, is within its dates, has uses left (the total limit, then the per-customer
 * limit once the phone is known), no line is discounted (exclusivity), and the subtotal reaches
 * `min_order`. A percentage is rounded to whole rupees and capped by `max_discount`; a fixed
 * amount is clamped to the subtotal. Coupons never touch shipping.
 */
export function resolveCoupon(input: {
  couponCode: string | null;
  coupon: PricingCoupon | null;
  subtotal: Paisa;
  hasDiscountedLine: boolean;
  couponsEnabled: boolean;
  now: Date;
}): CouponResult {
  const { coupon, subtotal, now } = input;
  if (!input.couponsEnabled || input.couponCode === null) return { status: "none" };

  const code = normalizeCouponCode(input.couponCode);
  const reject = (reason: Exclude<CouponRejectReason, "COUPON_MIN_ORDER">): CouponResult => ({
    status: "rejected",
    code,
    reason,
    message: COUPON_MESSAGES[reason],
  });

  if (!coupon || normalizeCouponCode(coupon.code) !== code) return reject("COUPON_NOT_FOUND");
  if (!coupon.isActive) return reject("COUPON_INACTIVE");
  if (coupon.startsAt && coupon.startsAt.getTime() > now.getTime()) return reject("COUPON_NOT_STARTED");
  if (coupon.endsAt && coupon.endsAt.getTime() <= now.getTime()) return reject("COUPON_EXPIRED");
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return reject("COUPON_USAGE_LIMIT");
  if (
    coupon.perCustomerLimit !== null &&
    coupon.customerUsedCount !== null &&
    coupon.customerUsedCount >= coupon.perCustomerLimit
  ) {
    return reject("COUPON_PER_CUSTOMER_LIMIT");
  }
  if (input.hasDiscountedLine) return reject("COUPON_BLOCKED_BY_DISCOUNT");
  if (coupon.minOrder !== null && subtotal < coupon.minOrder) {
    return {
      status: "rejected",
      code,
      reason: "COUPON_MIN_ORDER",
      message: `This coupon needs a minimum order of ${formatMoney(coupon.minOrder)}.`,
    };
  }

  let discount = coupon.type === "percent" ? percentAmount(subtotal, coupon.value) : coupon.value;
  if (coupon.type === "percent" && coupon.maxDiscount !== null) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.max(0, Math.min(discount, subtotal));

  return { status: "applied", couponId: coupon.id, code, discount };
}

export type PricingZone = {
  mode: "flat" | "quote";
  flatRate: Paisa;
  /** In `flat` mode, shipping is free once the goods total reaches this amount. */
  freeOverAmount: Paisa | null;
  codEnabled: boolean;
};

export type ShippingResult =
  /** A `quote` zone, or no zone known yet: staff confirm the charge after the order (§4.1). */
  | { status: "pending" }
  | { status: "priced"; amount: Paisa };

/** `goodsTotal` is what the customer pays for the goods (after discounts and coupon). */
export function calculateShipping(zone: PricingZone | null, goodsTotal: Paisa): ShippingResult {
  if (!zone || zone.mode === "quote") return { status: "pending" };
  if (zone.freeOverAmount !== null && goodsTotal >= zone.freeOverAmount) return { status: "priced", amount: 0 };
  return { status: "priced", amount: zone.flatRate };
}

export type PricingFlags = { coupons: boolean; cod: boolean };

/** COD needs the flag, the zone's `cod_enabled` and Pakistan as the country: a hard rule (§4.1). */
export function isCodAvailable(zone: PricingZone | null, country: string | null, flags: PricingFlags): boolean {
  return flags.cod && zone !== null && zone.codEnabled && country === "PK";
}

export type CartCalculation = {
  lines: CartLine[];
  /** Σ basePrice × quantity, before any discount or coupon. */
  subtotal: Paisa;
  /** Σ lineDiscount. */
  discountTotal: Paisa;
  coupon: CouponResult;
  /** 0 unless the coupon is applied. */
  couponDiscount: Paisa;
  /** subtotal − discountTotal − couponDiscount. */
  goodsTotal: Paisa;
  shipping: ShippingResult;
  /** goodsTotal plus shipping when priced; equals goodsTotal while shipping is pending. */
  total: Paisa;
  codAvailable: boolean;
};

/**
 * What the goods cost after discounts and coupon, for a cart or a stored order: the amount a
 * bank-transfer customer pays at checkout (owner decision, S8; the delivery charge follows).
 */
export function goodsTotalOf(amounts: { subtotal: Paisa; discountTotal: Paisa; couponDiscount: Paisa }): Paisa {
  return amounts.subtotal - amounts.discountTotal - amounts.couponDiscount;
}

/**
 * A stored order's new total once staff set the delivery charge (S9, client decision C13): the
 * goods total plus the charge. Coupons never reduce the delivery charge.
 */
export function totalWithDeliveryCharge(
  amounts: { subtotal: Paisa; discountTotal: Paisa; couponDiscount: Paisa },
  deliveryCharge: Paisa,
): Paisa {
  return goodsTotalOf(amounts) + deliveryCharge;
}

/**
 * The whole cart on plain data: every line through `priceVariant`, then the coupon, shipping,
 * COD and totals. The browser only ever supplies variant ids and quantities; every amount here
 * comes from the loaded rows.
 */
export function calculateCart(input: {
  lines: CartLineInput[];
  discounts: PricingDiscount[];
  couponCode: string | null;
  /** The row matching `couponCode`, if any; null when no such code exists. */
  coupon: PricingCoupon | null;
  zone: PricingZone | null;
  country: string | null;
  flags: PricingFlags;
  now: Date;
}): CartCalculation {
  const lines: CartLine[] = input.lines.map((line) => {
    const price = priceVariant(line.product, line.priceOverride, input.discounts, input.now);
    return {
      variantId: line.variantId,
      quantity: line.quantity,
      price,
      lineTotal: price.unitPrice * line.quantity,
      lineDiscount: (price.basePrice - price.unitPrice) * line.quantity,
    };
  });

  const subtotal = lines.reduce((sum, line) => sum + line.price.basePrice * line.quantity, 0);
  const discountTotal = lines.reduce((sum, line) => sum + line.lineDiscount, 0);

  const coupon = resolveCoupon({
    couponCode: input.couponCode,
    coupon: input.coupon,
    subtotal,
    hasDiscountedLine: lines.some((line) => isDiscounted(line.price)),
    couponsEnabled: input.flags.coupons,
    now: input.now,
  });
  const couponDiscount = coupon.status === "applied" ? coupon.discount : 0;

  const goodsTotal = goodsTotalOf({ subtotal, discountTotal, couponDiscount });
  const shipping = calculateShipping(input.zone, goodsTotal);
  const total = goodsTotal + (shipping.status === "priced" ? shipping.amount : 0);

  return {
    lines,
    subtotal,
    discountTotal,
    coupon,
    couponDiscount,
    goodsTotal,
    shipping,
    total,
    codAvailable: isCodAvailable(input.zone, input.country, input.flags),
  };
}
