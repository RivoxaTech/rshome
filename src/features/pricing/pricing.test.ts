import { describe, expect, it } from "vitest";
import {
  applyDiscount,
  discountMatchesProduct,
  isDiscountActive,
  percentOff,
  priceVariant,
  variantBasePrice,
  type PricingDiscount,
  type PricingProduct,
} from "./pricing";

const NOW = new Date("2026-09-29T12:00:00Z");

const tray: PricingProduct = { id: 5, price: 240000, categoryId: 3, parentCategoryId: null };

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
