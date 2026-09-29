import { describe, expect, it } from "vitest";
import {
  applyDiscount,
  calculateCart,
  calculateShipping,
  discountMatchesProduct,
  isCodAvailable,
  isDiscountActive,
  isDiscounted,
  normalizeCouponCode,
  percentAmount,
  percentOff,
  priceVariant,
  resolveCoupon,
  variantBasePrice,
  type CartLineInput,
  type PricingCoupon,
  type PricingDiscount,
  type PricingProduct,
  type PricingZone,
} from "./pricing";

const NOW = new Date("2026-09-29T12:00:00Z");

const tray: PricingProduct = { id: 5, price: 240000, categoryId: 3, parentCategoryId: null };
const vase: PricingProduct = { id: 7, price: 290000, categoryId: 4, parentCategoryId: null };

function discount(overrides: Partial<PricingDiscount> = {}): PricingDiscount {
  return {
    id: 1,
    type: "percent",
    value: 1000,
    targetType: "all",
    targetIds: [],
    isActive: true,
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

describe("variantBasePrice", () => {
  it("uses the price override when set", () => {
    expect(variantBasePrice(240000, 280000)).toBe(280000);
  });

  it("falls back to the product price when the override is null", () => {
    expect(variantBasePrice(240000, null)).toBe(240000);
  });

  it("keeps an override of 0 instead of falling back", () => {
    expect(variantBasePrice(240000, 0)).toBe(0);
  });
});

describe("isDiscountActive", () => {
  it("is active with open bounds", () => {
    expect(isDiscountActive(discount(), NOW)).toBe(true);
  });

  it("is inactive when switched off, even within its dates", () => {
    expect(isDiscountActive(discount({ isActive: false }), NOW)).toBe(false);
  });

  it("is inactive before starts_at", () => {
    expect(isDiscountActive(discount({ startsAt: new Date("2026-09-30T00:00:00Z") }), NOW)).toBe(false);
  });

  it("is active from exactly starts_at", () => {
    expect(isDiscountActive(discount({ startsAt: NOW }), NOW)).toBe(true);
  });

  it("is inactive from exactly ends_at (the end is exclusive)", () => {
    expect(isDiscountActive(discount({ endsAt: NOW }), NOW)).toBe(false);
  });

  it("is active inside a closed window", () => {
    const window = { startsAt: new Date("2026-09-01T00:00:00Z"), endsAt: new Date("2026-10-01T00:00:00Z") };
    expect(isDiscountActive(discount(window), NOW)).toBe(true);
  });

  it("is inactive after ends_at", () => {
    expect(isDiscountActive(discount({ endsAt: new Date("2026-09-01T00:00:00Z") }), NOW)).toBe(false);
  });
});

describe("discountMatchesProduct", () => {
  it("matches every product for a store-wide discount", () => {
    expect(discountMatchesProduct(discount({ targetType: "all" }), tray)).toBe(true);
  });

  it("matches a targeted product and nothing else", () => {
    expect(discountMatchesProduct(discount({ targetType: "product", targetIds: [5] }), tray)).toBe(true);
    expect(discountMatchesProduct(discount({ targetType: "product", targetIds: [6] }), tray)).toBe(false);
  });

  it("matches the product's own category", () => {
    expect(discountMatchesProduct(discount({ targetType: "category", targetIds: [3] }), tray)).toBe(true);
  });

  it("matches the parent of the product's category", () => {
    const childProduct = { ...tray, categoryId: 9, parentCategoryId: 3 };
    expect(discountMatchesProduct(discount({ targetType: "category", targetIds: [3] }), childProduct)).toBe(true);
  });

  it("does not match an unrelated category", () => {
    const childProduct = { ...tray, categoryId: 9, parentCategoryId: 3 };
    expect(discountMatchesProduct(discount({ targetType: "category", targetIds: [4] }), childProduct)).toBe(false);
  });

  it("does not treat a category id as a product id", () => {
    expect(discountMatchesProduct(discount({ targetType: "category", targetIds: [5] }), tray)).toBe(false);
  });
});

describe("applyDiscount", () => {
  it("takes a percentage off", () => {
    expect(applyDiscount(240000, discount({ type: "percent", value: 1000 }))).toBe(216000);
  });

  it("rounds a percentage amount to whole rupees, half up", () => {
    // 15% of 2,350 = 352.50 -> 353 off
    expect(applyDiscount(235000, discount({ type: "percent", value: 1500 }))).toBe(199700);
  });

  it("rounds a percentage amount below half down", () => {
    // 10% of 2,344 = 234.40 -> 234 off
    expect(applyDiscount(234400, discount({ type: "percent", value: 1000 }))).toBe(211000);
  });

  it("handles a fractional percentage", () => {
    // 12.5% of 999 = 124.875 -> 125 off
    expect(applyDiscount(99900, discount({ type: "percent", value: 1250 }))).toBe(87400);
  });

  it("takes a fixed amount off per unit", () => {
    expect(applyDiscount(240000, discount({ type: "fixed", value: 50000 }))).toBe(190000);
  });

  it("clamps a fixed amount larger than the price at 0", () => {
    expect(applyDiscount(240000, discount({ type: "fixed", value: 300000 }))).toBe(0);
  });

  it("clamps a percentage over 100 at 0", () => {
    expect(applyDiscount(240000, discount({ type: "percent", value: 15000 }))).toBe(0);
  });
});

describe("priceVariant", () => {
  it("returns the base price when no discount exists", () => {
    expect(priceVariant(tray, null, [], NOW)).toEqual({ basePrice: 240000, unitPrice: 240000, discountId: null });
  });

  it("applies a matching discount against the variant's own override price", () => {
    const trays10 = discount({ id: 7, targetType: "category", targetIds: [3] });
    expect(priceVariant(tray, 330000, [trays10], NOW)).toEqual({
      basePrice: 330000,
      unitPrice: 297000,
      discountId: 7,
    });
  });

  it("ignores a discount that does not match the product", () => {
    const other = discount({ targetType: "category", targetIds: [4] });
    expect(priceVariant(tray, null, [other], NOW).discountId).toBeNull();
  });

  it("ignores an inactive or expired discount", () => {
    const off = discount({ id: 1, isActive: false });
    const expired = discount({ id: 2, endsAt: new Date("2026-09-01T00:00:00Z") });
    const upcoming = discount({ id: 3, startsAt: new Date("2026-10-01T00:00:00Z") });
    expect(priceVariant(tray, null, [off, expired, upcoming], NOW)).toEqual({
      basePrice: 240000,
      unitPrice: 240000,
      discountId: null,
    });
  });

  it("picks the single discount giving the lowest unit price and never stacks", () => {
    const tenPercent = discount({ id: 1, value: 1000 });
    const twentyPercent = discount({ id: 2, value: 2000 });
    const fixed300 = discount({ id: 3, type: "fixed", value: 30000 });
    expect(priceVariant(tray, null, [tenPercent, twentyPercent, fixed300], NOW)).toEqual({
      basePrice: 240000,
      unitPrice: 192000,
      discountId: 2,
    });
  });

  it("breaks a tie on the lowest discount id, whatever the input order", () => {
    // 10% of 2,400 and a fixed 240 both give 2,160.
    const fixed = discount({ id: 4, type: "fixed", value: 24000 });
    const percent = discount({ id: 9, value: 1000 });
    expect(priceVariant(tray, null, [percent, fixed], NOW).discountId).toBe(4);
    expect(priceVariant(tray, null, [fixed, percent], NOW).discountId).toBe(4);
  });

  it("can pick a different winner per variant, since each uses its own base price", () => {
    const tenPercent = discount({ id: 1, value: 1000 });
    const fixed300 = discount({ id: 2, type: "fixed", value: 30000 });
    // 1,000: 10% -> 900, fixed -> 700. 5,000: 10% -> 4,500, fixed -> 4,700.
    expect(priceVariant(tray, 100000, [tenPercent, fixed300], NOW).discountId).toBe(2);
    expect(priceVariant(tray, 500000, [tenPercent, fixed300], NOW).discountId).toBe(1);
  });

  it("reports no discount when a matching discount does not lower the price", () => {
    const zero = discount({ value: 0 });
    expect(priceVariant(tray, null, [zero], NOW).discountId).toBeNull();
  });
});

describe("percentOff", () => {
  it("is the whole-percent saving", () => {
    expect(percentOff({ basePrice: 240000, unitPrice: 216000, discountId: 1 })).toBe(10);
  });

  it("rounds to the nearest percent", () => {
    // 350 off 2,900 = 12.07%
    expect(percentOff({ basePrice: 290000, unitPrice: 255000, discountId: 1 })).toBe(12);
  });

  it("is 0 without a saving or with a zero base price", () => {
    expect(percentOff({ basePrice: 240000, unitPrice: 240000, discountId: null })).toBe(0);
    expect(percentOff({ basePrice: 0, unitPrice: 0, discountId: null })).toBe(0);
  });
});

describe("percentAmount", () => {
  it("rounds to whole rupees, half up", () => {
    expect(percentAmount(235000, 1500)).toBe(35300); // 352.50 -> 353
    expect(percentAmount(234400, 1000)).toBe(23400); // 234.40 -> 234
    expect(percentAmount(99900, 1250)).toBe(12500); // 124.875 -> 125
  });
});

describe("isDiscounted", () => {
  it("is true only when the unit price is below the base price", () => {
    expect(isDiscounted({ basePrice: 240000, unitPrice: 216000, discountId: 1 })).toBe(true);
    expect(isDiscounted({ basePrice: 240000, unitPrice: 240000, discountId: null })).toBe(false);
  });
});

describe("normalizeCouponCode", () => {
  it("trims and uppercases", () => {
    expect(normalizeCouponCode("  welcome10 ")).toBe("WELCOME10");
  });
});

// --- Cart -----------------------------------------------------------------------------------

function coupon(overrides: Partial<PricingCoupon> = {}): PricingCoupon {
  return {
    id: 1,
    code: "WELCOME10",
    type: "percent",
    value: 1000,
    minOrder: 300000,
    maxDiscount: null,
    usageLimit: null,
    usedCount: 0,
    perCustomerLimit: null,
    customerUsedCount: null,
    isActive: true,
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

function line(product: PricingProduct, quantity: number, priceOverride: number | null = null): CartLineInput {
  return { variantId: product.id * 10, quantity, product, priceOverride };
}

const flags = { coupons: true, cod: true };
const quoteZone: PricingZone = { mode: "quote", flatRate: 0, freeOverAmount: null, codEnabled: true };
const flatZone: PricingZone = { mode: "flat", flatRate: 30000, freeOverAmount: null, codEnabled: true };

/** Two vases (PKR 5,800 gross), no discounts, the sample coupon and its row, unless overridden. */
function cart(overrides: Partial<Parameters<typeof calculateCart>[0]> = {}) {
  return calculateCart({
    lines: [line(vase, 2)],
    discounts: [],
    couponCode: "WELCOME10",
    coupon: coupon(),
    zone: null,
    country: null,
    flags,
    now: NOW,
    ...overrides,
  });
}

describe("resolveCoupon", () => {
  const base = {
    couponCode: "WELCOME10",
    coupon: coupon(),
    subtotal: 580000,
    hasDiscountedLine: false,
    couponsEnabled: true,
    now: NOW,
  };

  it("matches the code case-insensitively and ignores surrounding spaces", () => {
    expect(resolveCoupon({ ...base, couponCode: " welcome10 " })).toMatchObject({ status: "applied", code: "WELCOME10" });
  });

  it("is none without a code or when coupons are switched off", () => {
    expect(resolveCoupon({ ...base, couponCode: null })).toEqual({ status: "none" });
    expect(resolveCoupon({ ...base, couponsEnabled: false })).toEqual({ status: "none" });
  });

  it("rejects an unknown code, and a row whose code does not match", () => {
    expect(resolveCoupon({ ...base, coupon: null })).toMatchObject({ status: "rejected", reason: "COUPON_NOT_FOUND" });
    expect(resolveCoupon({ ...base, coupon: coupon({ code: "OTHER" }) })).toMatchObject({ reason: "COUPON_NOT_FOUND" });
  });

  it("rejects a switched-off coupon", () => {
    expect(resolveCoupon({ ...base, coupon: coupon({ isActive: false }) })).toMatchObject({ reason: "COUPON_INACTIVE" });
  });

  it("rejects a coupon outside its dates (start inclusive, end exclusive)", () => {
    expect(resolveCoupon({ ...base, coupon: coupon({ startsAt: new Date("2026-10-01T00:00:00Z") }) })).toMatchObject({
      reason: "COUPON_NOT_STARTED",
    });
    expect(resolveCoupon({ ...base, coupon: coupon({ endsAt: new Date("2026-09-01T00:00:00Z") }) })).toMatchObject({
      reason: "COUPON_EXPIRED",
    });
    expect(resolveCoupon({ ...base, coupon: coupon({ endsAt: NOW }) })).toMatchObject({ reason: "COUPON_EXPIRED" });
    expect(resolveCoupon({ ...base, coupon: coupon({ startsAt: NOW }) })).toMatchObject({ status: "applied" });
  });

  it("rejects a coupon that has reached its total usage limit", () => {
    expect(resolveCoupon({ ...base, coupon: coupon({ usageLimit: 5, usedCount: 5 }) })).toMatchObject({
      reason: "COUPON_USAGE_LIMIT",
    });
    expect(resolveCoupon({ ...base, coupon: coupon({ usageLimit: 5, usedCount: 4 }) })).toMatchObject({ status: "applied" });
  });

  it("rejects a coupon this customer has used up, only once the phone is known", () => {
    expect(resolveCoupon({ ...base, coupon: coupon({ perCustomerLimit: 1, customerUsedCount: 1 }) })).toMatchObject({
      reason: "COUPON_PER_CUSTOMER_LIMIT",
      message: "You have already used this coupon.",
    });
    expect(resolveCoupon({ ...base, coupon: coupon({ perCustomerLimit: 2, customerUsedCount: 1 }) })).toMatchObject({ status: "applied" });
    expect(resolveCoupon({ ...base, coupon: coupon({ perCustomerLimit: 1, customerUsedCount: null }) })).toMatchObject({ status: "applied" });
  });

  it("rejects a coupon below min_order and accepts one exactly at it", () => {
    expect(resolveCoupon({ ...base, subtotal: 299900 })).toMatchObject({
      status: "rejected",
      reason: "COUPON_MIN_ORDER",
      message: "This coupon needs a minimum order of PKR 3,000.",
    });
    expect(resolveCoupon({ ...base, subtotal: 300000 })).toMatchObject({ status: "applied" });
  });

  it("is blocked by a discounted line, with the agreed message", () => {
    expect(resolveCoupon({ ...base, hasDiscountedLine: true })).toEqual({
      status: "rejected",
      code: "WELCOME10",
      reason: "COUPON_BLOCKED_BY_DISCOUNT",
      message: "Coupons cannot be combined with discounted items.",
    });
  });

  it("rounds a percentage to whole rupees, half up", () => {
    // 10% of 5,805 = 580.50 -> 581
    expect(resolveCoupon({ ...base, subtotal: 580500 })).toMatchObject({ discount: 58100 });
  });

  it("caps a percentage by max_discount", () => {
    expect(resolveCoupon({ ...base, coupon: coupon({ maxDiscount: 50000 }) })).toMatchObject({ discount: 50000 });
  });

  it("clamps a fixed amount to the subtotal", () => {
    const fixed = coupon({ type: "fixed", value: 1000000, minOrder: null });
    expect(resolveCoupon({ ...base, coupon: fixed, subtotal: 580000 })).toMatchObject({ discount: 580000 });
    expect(resolveCoupon({ ...base, coupon: fixed, subtotal: 2000000 })).toMatchObject({ discount: 1000000 });
  });
});

describe("calculateShipping", () => {
  it("is pending for a quote zone and when no zone is known yet", () => {
    expect(calculateShipping(quoteZone, 500000)).toEqual({ status: "pending" });
    expect(calculateShipping(null, 500000)).toEqual({ status: "pending" });
  });

  it("charges the flat rate", () => {
    expect(calculateShipping(flatZone, 500000)).toEqual({ status: "priced", amount: 30000 });
  });

  it("is free from the free-over threshold, and charged below it", () => {
    const freeOver = { ...flatZone, freeOverAmount: 500000 };
    expect(calculateShipping(freeOver, 500000)).toEqual({ status: "priced", amount: 0 });
    expect(calculateShipping(freeOver, 499900)).toEqual({ status: "priced", amount: 30000 });
  });
});

describe("isCodAvailable", () => {
  it("allows COD only for Pakistan in a zone with cod_enabled", () => {
    expect(isCodAvailable(quoteZone, "PK", flags)).toBe(true);
    expect(isCodAvailable({ ...quoteZone, codEnabled: false }, "PK", flags)).toBe(false);
  });

  it("refuses COD for a non-PK country even when the zone says cod_enabled", () => {
    expect(isCodAvailable(quoteZone, "AE", flags)).toBe(false);
    expect(isCodAvailable(quoteZone, "pk", flags)).toBe(false);
    expect(isCodAvailable(quoteZone, null, flags)).toBe(false);
  });

  it("refuses COD without a zone or with the flag off", () => {
    expect(isCodAvailable(null, "PK", flags)).toBe(false);
    expect(isCodAvailable(quoteZone, "PK", { ...flags, cod: false })).toBe(false);
  });
});

describe("calculateCart", () => {
  it("prices every line through priceVariant and sums the totals", () => {
    const trays10 = discount({ id: 7, targetType: "category", targetIds: [3] });
    const result = cart({ lines: [line(tray, 2, 330000), line(vase, 1)], discounts: [trays10], couponCode: null, coupon: null });
    expect(result.lines).toEqual([
      {
        variantId: 50,
        quantity: 2,
        price: { basePrice: 330000, unitPrice: 297000, discountId: 7 },
        lineTotal: 594000,
        lineDiscount: 66000,
      },
      {
        variantId: 70,
        quantity: 1,
        price: { basePrice: 290000, unitPrice: 290000, discountId: null },
        lineTotal: 290000,
        lineDiscount: 0,
      },
    ]);
    expect(result).toMatchObject({
      subtotal: 950000,
      discountTotal: 66000,
      coupon: { status: "none" },
      couponDiscount: 0,
      goodsTotal: 884000,
      shipping: { status: "pending" },
      total: 884000,
      codAvailable: false,
    });
  });

  it("applies the coupon to an undiscounted cart and takes it off the total", () => {
    const result = cart();
    expect(result.coupon).toEqual({ status: "applied", couponId: 1, code: "WELCOME10", discount: 58000 });
    expect(result).toMatchObject({ subtotal: 580000, couponDiscount: 58000, goodsTotal: 522000, total: 522000 });
  });

  it("removes the coupon when a discounted item is added", () => {
    const trays10 = discount({ id: 7, targetType: "category", targetIds: [3] });
    const before = cart({ discounts: [trays10] });
    expect(before.coupon.status).toBe("applied");

    const after = cart({ discounts: [trays10], lines: [line(vase, 2), line(tray, 1)] });
    expect(after.coupon).toMatchObject({
      status: "rejected",
      reason: "COUPON_BLOCKED_BY_DISCOUNT",
      message: "Coupons cannot be combined with discounted items.",
    });
    expect(after.couponDiscount).toBe(0);
    expect(after.total).toBe(after.subtotal - after.discountTotal);
  });

  it("rejects a coupon below min_order, an expired one and one over its usage limit", () => {
    expect(cart({ lines: [line(vase, 1)] }).coupon).toMatchObject({ reason: "COUPON_MIN_ORDER" });
    expect(cart({ coupon: coupon({ endsAt: new Date("2026-09-28T00:00:00Z") }) }).coupon).toMatchObject({
      reason: "COUPON_EXPIRED",
    });
    expect(cart({ coupon: coupon({ usageLimit: 1, usedCount: 1 }) }).coupon).toMatchObject({
      reason: "COUPON_USAGE_LIMIT",
    });
  });

  it("never lets a coupon reduce shipping", () => {
    const fixed = coupon({ type: "fixed", value: 9999900, minOrder: null });
    const result = cart({ coupon: fixed, zone: flatZone, country: "PK" });
    expect(result.couponDiscount).toBe(580000);
    expect(result.goodsTotal).toBe(0);
    expect(result.shipping).toEqual({ status: "priced", amount: 30000 });
    expect(result.total).toBe(30000);
  });

  it("keeps shipping pending in a quote zone, so the total is the goods total", () => {
    const result = cart({ zone: quoteZone, country: "PK", couponCode: null, coupon: null });
    expect(result.shipping).toEqual({ status: "pending" });
    expect(result.total).toBe(result.goodsTotal);
    expect(result.codAvailable).toBe(true);
  });

  it("compares free-over with the goods total after the coupon", () => {
    // 5,800 gross, 580 coupon: 5,220 goods, below a 5,500 threshold.
    const zone = { ...flatZone, freeOverAmount: 550000 };
    expect(cart({ zone, country: "PK" }).shipping).toEqual({ status: "priced", amount: 30000 });
    expect(cart({ zone, country: "PK", couponCode: null, coupon: null }).shipping).toEqual({ status: "priced", amount: 0 });
  });

  it("refuses COD for a non-PK country even if the zone allows it", () => {
    expect(cart({ zone: quoteZone, country: "GB" }).codAvailable).toBe(false);
    expect(cart({ zone: quoteZone, country: "PK" }).codAvailable).toBe(true);
  });

  it("ignores the coupon entirely when the coupons flag is off", () => {
    expect(cart({ flags: { coupons: false, cod: true } })).toMatchObject({ coupon: { status: "none" }, total: 580000 });
  });

  it("handles an empty cart", () => {
    expect(cart({ lines: [], couponCode: null, coupon: null })).toMatchObject({ lines: [], subtotal: 0, total: 0 });
  });
});
