import { describe, expect, it } from "vitest";
import {
  categoryInputSchema,
  defaultVariantCreateSchema,
  productBackHrefSchema,
  productImageSchema,
  productInputSchema,
  productListQuerySchema,
} from "./schemas";

const hex32 = "a".repeat(32);

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

  it("accepts a real products/<hex> imagePath", () => {
    const result = productInputSchema.safeParse({ ...validProduct, imagePath: `products/${hex32}`, imagePathWidth: "800", imagePathHeight: "600" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.imagePath).toBe(`products/${hex32}`);
  });

  it("rejects a malformed imagePath (S10 phase 3b hardening, D54): traversal, absolute, URL, the categories folder, uppercase hex, empty-but-present", () => {
    for (const badPath of ["../x", "products/../x", "C:\\x", "/etc/x", "https://x", `categories/${hex32}`, `products/${hex32.toUpperCase()}`, "products/short"]) {
      const result = productInputSchema.safeParse({ ...validProduct, imagePath: badPath });
      expect(result.success, `expected imagePath "${badPath}" to be refused`).toBe(false);
    }
  });
});

describe("productImageSchema", () => {
  const validImage = { path: `products/${hex32}`, width: 800, height: 600 };

  it("accepts the exact shape the upload route produces", () => {
    expect(productImageSchema.safeParse(validImage).success).toBe(true);
  });

  it("rejects every known-bad shape: traversal, absolute, URL, another feature's folder, uppercase hex, too short, empty", () => {
    const badPaths = ["../x", "products/../x", "C:\\x", "/etc/x", "https://x", `proofs/${hex32}`, `products/${hex32.toUpperCase()}`, "products/short", ""];
    for (const path of badPaths) {
      const result = productImageSchema.safeParse({ ...validImage, path });
      expect(result.success, `expected path "${path}" to be refused`).toBe(false);
    }
  });

  it("rejects a categories/<hex> path — a valid upload shape in general, but the wrong folder for a product image", () => {
    const result = productImageSchema.safeParse({ ...validImage, path: `categories/${hex32}` });
    expect(result.success).toBe(false);
  });
});

describe("categoryInputSchema", () => {
  const validCategory = { name: "Trays", slug: "trays", description: "", imagePath: "", sortOrder: "0", isActive: "true", parentId: "" };

  it("accepts a real categories/<hex> imagePath", () => {
    const result = categoryInputSchema.safeParse({ ...validCategory, imagePath: `categories/${hex32}` });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.imagePath).toBe(`categories/${hex32}`);
  });

  it("accepts the dev seed's enumerated placeholder paths (scripts/seed.ts), and nothing else under seed/", () => {
    for (const name of ["hero", "tableware", "teaset", "tray"]) {
      expect(categoryInputSchema.safeParse({ ...validCategory, imagePath: `seed/${name}` }).success).toBe(true);
    }
    expect(categoryInputSchema.safeParse({ ...validCategory, imagePath: "seed/anything-else" }).success).toBe(false);
  });

  it("rejects a products/<hex> path — a valid upload shape in general, but the wrong folder for a category image", () => {
    const result = categoryInputSchema.safeParse({ ...validCategory, imagePath: `products/${hex32}` });
    expect(result.success).toBe(false);
  });

  it("rejects every known-bad shape: traversal, absolute, URL, uppercase hex, too short", () => {
    for (const badPath of ["../x", "categories/../x", "C:\\x", "/etc/x", "https://x", `categories/${hex32.toUpperCase()}`, "categories/short"]) {
      const result = categoryInputSchema.safeParse({ ...validCategory, imagePath: badPath });
      expect(result.success, `expected imagePath "${badPath}" to be refused`).toBe(false);
    }
  });

  it("blank imagePath becomes null", () => {
    const result = categoryInputSchema.safeParse(validCategory);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.imagePath).toBeNull();
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
