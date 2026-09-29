import { describe, expect, it } from "vitest";
import { calculateCart, type PricingDiscount } from "@/features/pricing/pricing";
import { formatCartQuote, reconcileCart, toCartLineInputs, type CartVariant } from "./quote";
import { cartInputSchema } from "./schemas";

const NOW = new Date("2026-09-29T12:00:00Z");

function variant(overrides: Partial<CartVariant> = {}): CartVariant {
  return {
    id: 1,
    productId: 10,
    productName: "Ceramic Vase",
    productSlug: "ceramic-vase",
    variantLabel: "White",
    available: true,
    stock: 20,
    productPrice: 290000,
    priceOverride: null,
    categoryId: 4,
    parentCategoryId: null,
    image: null,
    ...overrides,
  };
}

const trays10: PricingDiscount = {
  id: 7,
  type: "percent",
  value: 1000,
  targetType: "category",
  targetIds: [3],
  isActive: true,
  startsAt: null,
  endsAt: null,
};

/** The whole pure path the service runs after loading rows: parse, reconcile, price, format. */
function quote(rawInput: unknown, variants: CartVariant[], discounts: PricingDiscount[] = []) {
  const input = cartInputSchema.parse(rawInput);
  const reconciled = reconcileCart(input.lines, variants);
  const calculation = calculateCart({
    lines: toCartLineInputs(reconciled.lines),
    discounts,
    couponCode: input.couponCode,
    coupon: null,
    zone: null,
    country: null,
    flags: { coupons: true, cod: true },
    now: NOW,
  });
  return formatCartQuote(reconciled.lines, calculation, reconciled.notices);
}

describe("cartInputSchema", () => {
  it("keeps only variant ids, quantities and the coupon code", () => {
    const parsed = cartInputSchema.parse({
      lines: [{ variantId: 1, quantity: 2, unitPrice: 1, price: "1.00" }],
      couponCode: " welcome10 ",
      total: "1.00",
      subtotal: 0,
    });
    expect(parsed).toEqual({ lines: [{ variantId: 1, quantity: 2 }], couponCode: "welcome10" });
  });

  it("treats a missing or blank coupon code as none", () => {
    expect(cartInputSchema.parse({ lines: [] }).couponCode).toBeNull();
    expect(cartInputSchema.parse({ lines: [], couponCode: "   " }).couponCode).toBeNull();
  });

  it("rejects bad ids and quantities", () => {
    expect(cartInputSchema.safeParse({ lines: [{ variantId: 0, quantity: 1 }] }).success).toBe(false);
    expect(cartInputSchema.safeParse({ lines: [{ variantId: 1, quantity: 0 }] }).success).toBe(false);
    expect(cartInputSchema.safeParse({ lines: [{ variantId: 1, quantity: 1.5 }] }).success).toBe(false);
    expect(cartInputSchema.safeParse({ lines: [{ variantId: 1, quantity: 100 }] }).success).toBe(false);
    expect(cartInputSchema.safeParse({ lines: [{ variantId: "1", quantity: 1 }] }).success).toBe(false);
  });
});

describe("reconcileCart", () => {
  it("keeps available lines as they are", () => {
    const result = reconcileCart([{ variantId: 1, quantity: 2 }], [variant()]);
    expect(result.lines).toMatchObject([{ variantId: 1, quantity: 2 }]);
    expect(result.notices).toEqual([]);
  });

  it("merges duplicate variant ids", () => {
    const result = reconcileCart(
      [
        { variantId: 1, quantity: 2 },
        { variantId: 1, quantity: 3 },
      ],
      [variant()],
    );
    expect(result.lines).toMatchObject([{ variantId: 1, quantity: 5 }]);
  });

  it("removes unknown and inactive variants and says so", () => {
    const result = reconcileCart(
      [
        { variantId: 1, quantity: 1 },
        { variantId: 2, quantity: 1 },
      ],
      [variant({ id: 1, available: false })],
    );
    expect(result.lines).toEqual([]);
    expect(result.notices).toEqual([
      { kind: "line", message: "Ceramic Vase (White) is no longer available and was removed." },
      { kind: "line", message: "An item is no longer available and was removed." },
    ]);
  });

  it("removes a sold-out variant", () => {
    const result = reconcileCart([{ variantId: 1, quantity: 1 }], [variant({ stock: 0, variantLabel: null })]);
    expect(result.lines).toEqual([]);
    expect(result.notices).toEqual([{ kind: "line", message: "Ceramic Vase is sold out and was removed." }]);
  });

  it("caps the quantity at stock", () => {
    const result = reconcileCart([{ variantId: 1, quantity: 9 }], [variant({ stock: 4 })]);
    expect(result.lines).toMatchObject([{ variantId: 1, quantity: 4 }]);
    expect(result.notices).toEqual([
      { kind: "line", message: "Only 4 of Ceramic Vase (White) available; the quantity was reduced." },
    ]);
  });
});

describe("formatCartQuote", () => {
  it("returns server-formatted lines and totals, and what the browser should store", () => {
    const result = quote(
      { lines: [{ variantId: 1, quantity: 2 }], couponCode: null },
      [variant({ priceOverride: 310000, image: { path: "seed/hero", width: 1920, height: 1280, alt: null } })],
    );
    expect(result).toEqual({
      lines: [
        {
          variantId: 1,
          productSlug: "ceramic-vase",
          name: "Ceramic Vase",
          variantLabel: "White",
          image: { path: "seed/hero", width: 1920, height: 1280, alt: null },
          quantity: 2,
          maxQuantity: 20,
          unitPrice: { amount: "PKR 3,100", original: null, badge: null },
          lineTotal: "PKR 6,200",
        },
      ],
      itemCount: 2,
      subtotal: "PKR 6,200",
      discountTotal: null,
      coupon: { status: "none" },
      delivery: { status: "pending" },
      total: "PKR 6,200",
      notices: [],
      storedLines: [{ variantId: 1, quantity: 2 }],
      storedCouponCode: null,
    });
  });

  it("shows a discounted line with its original price and the discount total", () => {
    const trayVariant = variant({ id: 3, productId: 5, productName: "Wooden Serving Tray", productSlug: "wooden-serving-tray", variantLabel: "Small", productPrice: 240000, categoryId: 3 });
    const result = quote({ lines: [{ variantId: 3, quantity: 1 }] }, [trayVariant], [trays10]);
    expect(result.lines[0].unitPrice).toEqual({ amount: "PKR 2,160", original: "PKR 2,400", badge: "10% off" });
    expect(result).toMatchObject({ subtotal: "PKR 2,400", discountTotal: "PKR 240", total: "PKR 2,160" });
  });

  it("drops a rejected coupon from storage and adds a notice", () => {
    const result = quote({ lines: [{ variantId: 1, quantity: 1 }], couponCode: "NOPE" }, [variant()]);
    expect(result.coupon).toMatchObject({ status: "rejected", code: "NOPE", reason: "COUPON_NOT_FOUND" });
    expect(result.storedCouponCode).toBeNull();
    expect(result.notices).toEqual([{ kind: "coupon", message: "Coupon NOPE was removed: This coupon code is not valid." }]);
  });

  it("caps maxQuantity at the stock so the UI cannot go past it", () => {
    const result = quote({ lines: [{ variantId: 1, quantity: 1 }] }, [variant({ stock: 3 })]);
    expect(result.lines[0].maxQuantity).toBe(3);
  });

  it("ignores a fake unit price and total sent by the browser", () => {
    const honest = quote({ lines: [{ variantId: 1, quantity: 2 }] }, [variant()]);
    const tampered = quote(
      {
        lines: [{ variantId: 1, quantity: 2, unitPrice: 100, price: "1.00", lineTotal: "2.00" }],
        subtotal: "2.00",
        total: "1.00",
        couponCode: null,
      },
      [variant()],
    );
    expect(tampered).toEqual(honest);
    expect(tampered.total).toBe("PKR 5,800");
  });
});
