import { describe, expect, it } from "vitest";
import { couponBackHrefSchema, couponInputSchema, couponListQuerySchema } from "./schemas";

const valid = {
  code: "save10",
  type: "percent",
  value: "10",
  minOrder: "",
  maxDiscount: "",
  usageLimit: "",
  perCustomerLimit: "",
  startsAt: "",
  endsAt: "",
  isActive: "true",
};

const errorsOf = (input: Record<string, unknown>) => {
  const result = couponInputSchema.safeParse(input);
  return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
};

describe("couponInputSchema", () => {
  it("trims and uppercases the code and normalises amounts; blank optionals become null", () => {
    const result = couponInputSchema.safeParse({ ...valid, code: "  save10 " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({ code: "SAVE10", value: "10.00", minOrder: null, maxDiscount: null, usageLimit: null, perCustomerLimit: null, startsAt: null, endsAt: null, isActive: true });
    }
  });

  it("allows A-Z, 0-9, dash and underscore only", () => {
    expect(couponInputSchema.safeParse({ ...valid, code: "WELCOME_10-X" }).success).toBe(true);
    expect(errorsOf({ ...valid, code: "SAVE 10" }).code).toMatch(/letters, numbers/);
    expect(errorsOf({ ...valid, code: "SAVE$10" }).code).toMatch(/letters, numbers/);
    expect(errorsOf({ ...valid, code: "SÄVE" }).code).toMatch(/letters, numbers/);
  });

  it("requires 3–32 characters", () => {
    expect(errorsOf({ ...valid, code: "AB" }).code).toMatch(/at least 3/);
    expect(errorsOf({ ...valid, code: "A".repeat(33) }).code).toMatch(/under 32/);
    expect(couponInputSchema.safeParse({ ...valid, code: "ABC" }).success).toBe(true);
    expect(couponInputSchema.safeParse({ ...valid, code: "A".repeat(32) }).success).toBe(true);
  });

  it("keeps a percentage within 1–100 and a fixed amount above 0", () => {
    expect(errorsOf({ ...valid, value: "0" }).value).toMatch(/between 1 and 100/);
    expect(errorsOf({ ...valid, value: "150" }).value).toMatch(/between 1 and 100/);
    expect(errorsOf({ ...valid, type: "fixed", value: "0" }).value).toMatch(/more than 0/);
    expect(couponInputSchema.safeParse({ ...valid, type: "fixed", value: "200" }).success).toBe(true);
  });

  it("takes a maximum discount cap for a percentage coupon only", () => {
    const capped = couponInputSchema.safeParse({ ...valid, maxDiscount: "500" });
    expect(capped.success && capped.data.maxDiscount).toBe("500.00");
    expect(errorsOf({ ...valid, type: "fixed", value: "200", maxDiscount: "500" }).maxDiscount).toMatch(/percentage coupons only/);
    expect(errorsOf({ ...valid, maxDiscount: "0" }).maxDiscount).toMatch(/above 0/);
  });

  it("takes a minimum order above 0, or none", () => {
    const withMin = couponInputSchema.safeParse({ ...valid, minOrder: "3000" });
    expect(withMin.success && withMin.data.minOrder).toBe("3000.00");
    expect(errorsOf({ ...valid, minOrder: "0" }).minOrder).toMatch(/above 0/);
    expect(errorsOf({ ...valid, minOrder: "lots" }).minOrder).toBeDefined();
  });

  it("limits are whole numbers of at least 1, or blank", () => {
    const limited = couponInputSchema.safeParse({ ...valid, usageLimit: "50", perCustomerLimit: "1" });
    expect(limited.success && limited.data).toMatchObject({ usageLimit: 50, perCustomerLimit: 1 });
    expect(errorsOf({ ...valid, usageLimit: "0" }).usageLimit).toMatch(/1 or higher/);
    expect(errorsOf({ ...valid, perCustomerLimit: "2.5" }).perCustomerLimit).toMatch(/whole number/);
  });

  it("reads dates as Karachi time and requires the end after the start", () => {
    const result = couponInputSchema.safeParse({ ...valid, startsAt: "2026-10-03T09:00", endsAt: "2026-10-10T09:00" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.startsAt?.toISOString()).toBe("2026-10-03T04:00:00.000Z");
    expect(errorsOf({ ...valid, startsAt: "2026-10-10T09:00", endsAt: "2026-10-03T09:00" }).endsAt).toMatch(/after the start/);
    expect(errorsOf({ ...valid, endsAt: "never" }).endsAt).toMatch(/valid date/);
  });
});

describe("couponListQuerySchema", () => {
  it("falls back to defaults on bad values", () => {
    expect(couponListQuerySchema.parse({ tab: "nope", page: "0", pageSize: "7" })).toEqual({ tab: "all", q: undefined, page: 1, pageSize: 25 });
    expect(couponListQuerySchema.parse({ tab: "used_up", q: "SAVE", page: "3", pageSize: "100" })).toEqual({ tab: "used_up", q: "SAVE", page: 3, pageSize: 100 });
  });
});

describe("couponBackHrefSchema", () => {
  it("accepts only the coupons list, with its own query string", () => {
    expect(couponBackHrefSchema.parse("/panel/coupons?tab=active")).toBe("/panel/coupons?tab=active");
    expect(couponBackHrefSchema.parse("/panel/discounts")).toBeUndefined();
  });
});
