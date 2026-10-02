import { describe, expect, it } from "vitest";
import {
  defaultVariantCreateSchema,
  productBackHrefSchema,
  productInputSchema,
  productListQuerySchema,
} from "./schemas";

const validProduct = {
  name: "Ceramic Vase",
  slug: "ceramic-vase",
  categoryId: "3",
  shortDescription: "",
  description: "",
  price: "1500",
  weightGrams: "",
  status: "active",
  isFeatured: "false",
  imagePath: "",
  imagePathWidth: "",
  imagePathHeight: "",
};

describe("productInputSchema", () => {
  it("accepts a valid product and normalises the price to DECIMAL(12,2)", () => {
    const result = productInputSchema.safeParse(validProduct);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.price).toBe("1500.00");
  });

  it("rejects a non-numeric price", () => {
    const result = productInputSchema.safeParse({ ...validProduct, price: "free" });
    expect(result.success).toBe(false);
  });

  it("rejects more than two decimal places", () => {
    const result = productInputSchema.safeParse({ ...validProduct, price: "1500.999" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing or non-positive category", () => {
    expect(productInputSchema.safeParse({ ...validProduct, categoryId: "0" }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...validProduct, categoryId: "" }).success).toBe(false);
  });

  it("rejects a status outside the three-way enum", () => {
    const result = productInputSchema.safeParse({ ...validProduct, status: "published" });
    expect(result.success).toBe(false);
  });

  it("blank optional fields become null, not empty strings", () => {
    const result = productInputSchema.safeParse(validProduct);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shortDescription).toBeNull();
      expect(result.data.weightGrams).toBeNull();
      expect(result.data.imagePath).toBeNull();
    }
  });
});

describe("defaultVariantCreateSchema", () => {
  it("requires a SKU and a non-negative integer stock", () => {
    expect(defaultVariantCreateSchema.safeParse({ sku: "RSH-001", stock: "10" }).success).toBe(true);
    expect(defaultVariantCreateSchema.safeParse({ sku: "", stock: "10" }).success).toBe(false);
    expect(defaultVariantCreateSchema.safeParse({ sku: "RSH-001", stock: "-1" }).success).toBe(false);
  });
});

describe("productListQuerySchema", () => {
  it("falls back to the 'all' tab and page 1 on bad input", () => {
    const result = productListQuerySchema.parse({ tab: "not-a-status", page: "nope" });
    expect(result.tab).toBe("all");
    expect(result.page).toBe(1);
  });
});

describe("productBackHrefSchema", () => {
  it("accepts only a /panel/products path", () => {
    expect(productBackHrefSchema.parse("/panel/products?tab=draft")).toBe("/panel/products?tab=draft");
  });

  it("falls back to undefined for anything else", () => {
    expect(productBackHrefSchema.parse("https://evil.example/")).toBeUndefined();
    expect(productBackHrefSchema.parse("/panel/categories")).toBeUndefined();
  });
});
