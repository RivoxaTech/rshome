import { describe, expect, it } from "vitest";
import type { PricingCoupon } from "@/features/pricing/pricing";
import { couponStatus, couponValueText, usageText } from "./status";

const now = new Date("2026-10-03T10:00:00.000Z");
const hour = 60 * 60 * 1000;

function coupon(overrides: Partial<PricingCoupon> = {}): PricingCoupon {
  return {
    id: 1,
    code: "SAVE10",
    type: "percent",
    value: 1000,
    minOrder: null,
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

describe("couponStatus (through the pricing module's resolveCoupon)", () => {
  it("is active with open bounds, with a minimum order, and with a per-customer limit (no phone known)", () => {
    expect(couponStatus(coupon(), now)).toBe("active");
    expect(couponStatus(coupon({ minOrder: 300_000 }), now)).toBe("active");
    expect(couponStatus(coupon({ perCustomerLimit: 1 }), now)).toBe("active");
  });

  it("is inactive when switched off, whatever the dates", () => {
    expect(couponStatus(coupon({ isActive: false }), now)).toBe("inactive");
    expect(couponStatus(coupon({ isActive: false, startsAt: new Date(now.getTime() + hour) }), now)).toBe("inactive");
  });

  it("is scheduled before starts_at and expired from ends_at", () => {
    expect(couponStatus(coupon({ startsAt: new Date(now.getTime() + hour) }), now)).toBe("scheduled");
    expect(couponStatus(coupon({ endsAt: now }), now)).toBe("expired");
    expect(couponStatus(coupon({ endsAt: new Date(now.getTime() + 1) }), now)).toBe("active");
  });

  it("is used up once the live usage count reaches the total limit", () => {
    expect(couponStatus(coupon({ usageLimit: 5, usedCount: 4 }), now)).toBe("active");
    expect(couponStatus(coupon({ usageLimit: 5, usedCount: 5 }), now)).toBe("used_up");
  });

  it("ranks inactive above the window and the window above the limit, as the checkout does", () => {
    expect(couponStatus(coupon({ isActive: false, usageLimit: 1, usedCount: 1 }), now)).toBe("inactive");
    expect(couponStatus(coupon({ endsAt: now, usageLimit: 1, usedCount: 1 }), now)).toBe("expired");
  });
});

describe("couponValueText", () => {
  it("formats a percentage, with its cap when set", () => {
    expect(couponValueText("percent", "10.00", null)).toBe("10%");
    expect(couponValueText("percent", "12.50", "500.00")).toBe("12.5% (up to PKR 500)");
  });

  it("formats a fixed amount through the money helper", () => {
    expect(couponValueText("fixed", "200.00", null)).toBe("PKR 200 off");
  });
});

describe("usageText", () => {
  it("shows the count against the limit, or alone", () => {
    expect(usageText(12, 50)).toBe("12 / 50");
    expect(usageText(12, null)).toBe("12");
  });
});
