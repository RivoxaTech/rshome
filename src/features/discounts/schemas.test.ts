import { describe, expect, it } from "vitest";
import { discountBackHrefSchema, discountInputSchema, discountListQuerySchema, discountOverlapQuerySchema, MAX_DISCOUNT_PRODUCTS } from "./schemas";

const valid = {
  name: "10% off Trays",
  type: "percent",
  value: "10",
  targetType: "category",
  categoryId: "3",
  productIds: "",
  startsAt: "",
  endsAt: "",
  isActive: "true",
};

const errorsOf = (input: Record<string, unknown>) => {
  const result = discountInputSchema.safeParse(input);
  return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
};

describe("discountInputSchema", () => {
  it("accepts a category discount and normalises the value to DECIMAL(12,2)", () => {
    const result = discountInputSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toMatchObject({ value: "10.00", targetType: "category", targetIds: [3], startsAt: null, endsAt: null, isActive: true });
  });

  it("a store-wide discount carries no target ids, whatever else was posted", () => {
    const result = discountInputSchema.safeParse({ ...valid, targetType: "all", categoryId: "3", productIds: "1,2" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.targetIds).toEqual([]);
  });

  it("reads the product picker's comma-separated ids, trimmed and de-duplicated", () => {
    const result = discountInputSchema.safeParse({ ...valid, targetType: "product", categoryId: "", productIds: " 5, 3,5 ,12" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.targetIds).toEqual([5, 3, 12]);
  });

  it("refuses more than the product cap, a non-numeric id, and an empty product set", () => {
    const tooMany = Array.from({ length: MAX_DISCOUNT_PRODUCTS + 1 }, (_, index) => index + 1).join(",");
    expect(errorsOf({ ...valid, targetType: "product", productIds: tooMany }).productIds).toMatch(/at most/);
    expect(errorsOf({ ...valid, targetType: "product", productIds: "1,abc" }).productIds).toBeDefined();
    expect(errorsOf({ ...valid, targetType: "product", productIds: "" }).productIds).toMatch(/at least one/);
  });

  it("requires a category for a category target", () => {
    expect(errorsOf({ ...valid, categoryId: "" }).categoryId).toMatch(/Choose a category/);
  });

  it("keeps a percentage within 1–100", () => {
    expect(errorsOf({ ...valid, value: "0" }).value).toMatch(/between 1 and 100/);
    expect(errorsOf({ ...valid, value: "0.5" }).value).toMatch(/between 1 and 100/);
    expect(errorsOf({ ...valid, value: "100.01" }).value).toMatch(/between 1 and 100/);
    expect(discountInputSchema.safeParse({ ...valid, value: "1" }).success).toBe(true);
    expect(discountInputSchema.safeParse({ ...valid, value: "100" }).success).toBe(true);
  });

  it("requires a fixed amount above 0 and allows any size above it", () => {
    expect(errorsOf({ ...valid, type: "fixed", value: "0" }).value).toMatch(/more than 0/);
    expect(discountInputSchema.safeParse({ ...valid, type: "fixed", value: "250" }).success).toBe(true);
  });

  it("refuses a non-numeric value and an unknown type or target", () => {
    expect(errorsOf({ ...valid, value: "ten" }).value).toBeDefined();
    expect(errorsOf({ ...valid, type: "bogo" }).type).toBeDefined();
    expect(errorsOf({ ...valid, targetType: "variant" }).targetType).toBeDefined();
  });

  it("reads dates as Karachi time and requires the end after the start", () => {
    const result = discountInputSchema.safeParse({ ...valid, startsAt: "2026-10-03T00:00", endsAt: "2026-10-04T00:00" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startsAt?.toISOString()).toBe("2026-10-02T19:00:00.000Z");
      expect(result.data.endsAt?.toISOString()).toBe("2026-10-03T19:00:00.000Z");
    }
    expect(errorsOf({ ...valid, startsAt: "2026-10-04T00:00", endsAt: "2026-10-04T00:00" }).endsAt).toMatch(/after the start/);
    expect(errorsOf({ ...valid, startsAt: "2026-10-05T00:00", endsAt: "2026-10-04T00:00" }).endsAt).toMatch(/after the start/);
  });

  it("refuses a malformed date-time but accepts an open bound on either side", () => {
    expect(errorsOf({ ...valid, startsAt: "soon" }).startsAt).toMatch(/valid date/);
    expect(discountInputSchema.safeParse({ ...valid, startsAt: "", endsAt: "2026-10-04T00:00" }).success).toBe(true);
    expect(discountInputSchema.safeParse({ ...valid, startsAt: "2026-10-04T00:00", endsAt: "" }).success).toBe(true);
  });

  it("reads the Switch's hidden true/false field", () => {
    const off = discountInputSchema.safeParse({ ...valid, isActive: "false" });
    expect(off.success && off.data.isActive).toBe(false);
  });

  it("requires a name", () => {
    expect(errorsOf({ ...valid, name: "  " }).name).toBeDefined();
  });
});

describe("discountOverlapQuerySchema", () => {
  it("accepts the form's live state, with an optional excludeId", () => {
    const result = discountOverlapQuerySchema.safeParse({ targetType: "product", categoryId: "", productIds: "1,2", excludeId: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ targetType: "product", categoryId: null, productIds: [1, 2], excludeId: null });
  });
});

describe("discountListQuerySchema", () => {
  it("falls back to defaults on bad values", () => {
    expect(discountListQuerySchema.parse({ tab: "nope", page: "x", pageSize: "7" })).toEqual({ tab: "all", q: undefined, page: 1, pageSize: 25 });
    expect(discountListQuerySchema.parse({ tab: "scheduled", q: "tray", page: "2", pageSize: "50" })).toEqual({ tab: "scheduled", q: "tray", page: 2, pageSize: 50 });
  });
});

describe("discountBackHrefSchema", () => {
  it("accepts only the discounts list, with its own query string", () => {
    expect(discountBackHrefSchema.parse("/panel/discounts?tab=active&page=2")).toBe("/panel/discounts?tab=active&page=2");
    expect(discountBackHrefSchema.parse("/panel/coupons")).toBeUndefined();
    expect(discountBackHrefSchema.parse("https://evil.example/")).toBeUndefined();
  });
});
