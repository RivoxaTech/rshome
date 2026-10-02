import { describe, expect, it } from "vitest";
import type { PricingDiscount } from "@/features/pricing/pricing";
import { discountStatus, discountValueText, targetSummary } from "./status";

const now = new Date("2026-10-03T10:00:00.000Z");
const hour = 60 * 60 * 1000;

function discount(overrides: Partial<PricingDiscount> = {}): PricingDiscount {
  return { id: 1, type: "percent", value: 1000, targetType: "all", targetIds: [], isActive: true, startsAt: null, endsAt: null, ...overrides };
}

describe("discountStatus", () => {
  it("is active with open bounds, and within a window", () => {
    expect(discountStatus(discount(), now)).toBe("active");
    expect(discountStatus(discount({ startsAt: new Date(now.getTime() - hour), endsAt: new Date(now.getTime() + hour) }), now)).toBe("active");
  });

  it("is inactive when switched off, even inside its dates or before they start", () => {
    expect(discountStatus(discount({ isActive: false }), now)).toBe("inactive");
    expect(discountStatus(discount({ isActive: false, startsAt: new Date(now.getTime() + hour) }), now)).toBe("inactive");
  });

  it("is scheduled before starts_at", () => {
    expect(discountStatus(discount({ startsAt: new Date(now.getTime() + hour) }), now)).toBe("scheduled");
  });

  it("is expired from exactly ends_at onward (the end is exclusive, as in pricing)", () => {
    expect(discountStatus(discount({ endsAt: now }), now)).toBe("expired");
    expect(discountStatus(discount({ endsAt: new Date(now.getTime() - hour) }), now)).toBe("expired");
    expect(discountStatus(discount({ endsAt: new Date(now.getTime() + 1) }), now)).toBe("active");
  });
});

describe("discountValueText", () => {
  it("formats a percentage without trailing zeros", () => {
    expect(discountValueText("percent", "10.00")).toBe("10%");
    expect(discountValueText("percent", "12.50")).toBe("12.5%");
    expect(discountValueText("percent", "7.25")).toBe("7.25%");
  });

  it("formats a fixed amount through the money helper", () => {
    expect(discountValueText("fixed", "500.00")).toBe("PKR 500 off");
    expect(discountValueText("fixed", "1250.00")).toBe("PKR 1,250 off");
  });
});

describe("targetSummary", () => {
  it("names the target kind", () => {
    expect(targetSummary("all", 0, null)).toBe("Whole store");
    expect(targetSummary("category", 1, "Trays")).toBe("Category: Trays");
    expect(targetSummary("category", 1, null)).toBe("Category: (deleted)");
    expect(targetSummary("product", 1, null)).toBe("1 product");
    expect(targetSummary("product", 3, null)).toBe("3 products");
  });
});
