import { describe, expect, it } from "vitest";
import { validateImportRow, PRODUCT_IMPORT_HEADERS } from "./csv-import-schema";

function validRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    "Product name": "Ceramic Dinner Plate",
    Slug: "ceramic-dinner-plate",
    "Category slug": "tableware",
    Status: "active",
    "Short description": "A plate.",
    Description: "A longer description.",
    Featured: "false",
    "Base price": "1500.00",
    "Variant SKU": "CDP-WHT-01",
    "Variant label": "White",
    Attributes: "Colour:White",
    Stock: "25",
    "Price override": "",
    "Variant active": "true",
    ...overrides,
  };
}

describe("PRODUCT_IMPORT_HEADERS", () => {
  it("has one column per field the service validates", () => {
    expect(PRODUCT_IMPORT_HEADERS.length).toBe(14);
  });
});

describe("validateImportRow", () => {
  it("accepts a valid row", () => {
    const { value, issues } = validateImportRow(validRow(), 2);
    expect(issues).toEqual([]);
    expect(value).toMatchObject({
      name: "Ceramic Dinner Plate",
      slug: "ceramic-dinner-plate",
      categorySlug: "tableware",
      status: "active",
      isFeatured: false,
      price: "1500.00",
      sku: "CDP-WHT-01",
      label: "White",
      attributes: { Colour: "White" },
      stock: 25,
      priceOverride: null,
      isActive: true,
    });
  });

  it("refuses a missing product name", () => {
    const { value, issues } = validateImportRow(validRow({ "Product name": "" }), 5);
    expect(value).toBeNull();
    expect(issues).toEqual([{ row: 5, column: "Product name", message: "Enter a product name." }]);
  });

  it("refuses a slug with uppercase letters or spaces", () => {
    const { issues } = validateImportRow(validRow({ Slug: "Not A Slug" }), 2);
    expect(issues.some((issue) => issue.column === "Slug")).toBe(true);
  });

  it("refuses an unknown status", () => {
    const { issues } = validateImportRow(validRow({ Status: "deleted" }), 2);
    expect(issues).toContainEqual({ row: 2, column: "Status", message: "Status must be draft, active or archived." });
  });

  it("refuses a non-boolean Featured cell", () => {
    const { issues } = validateImportRow(validRow({ Featured: "yes" }), 2);
    expect(issues).toContainEqual({ row: 2, column: "Featured", message: "Use true or false." });
  });

  it("refuses a malformed price", () => {
    const { issues } = validateImportRow(validRow({ "Base price": "PKR 1,500" }), 2);
    expect(issues.some((issue) => issue.column === "Base price")).toBe(true);
  });

  it("accepts a blank price override as null", () => {
    const { value } = validateImportRow(validRow({ "Price override": "" }), 2);
    expect(value?.priceOverride).toBeNull();
  });

  it("parses a valid price override", () => {
    const { value } = validateImportRow(validRow({ "Price override": "1200" }), 2);
    expect(value?.priceOverride).toBe("1200.00");
  });

  it("refuses a malformed attributes cell (no colon)", () => {
    const { issues } = validateImportRow(validRow({ Attributes: "JustAWord" }), 2);
    expect(issues.some((issue) => issue.column === "Attributes")).toBe(true);
  });

  it("parses multiple attribute pairs", () => {
    const { value } = validateImportRow(validRow({ Attributes: "Colour:White;Size:Large" }), 2);
    expect(value?.attributes).toEqual({ Colour: "White", Size: "Large" });
  });

  it("refuses a duplicate attribute name", () => {
    const { issues } = validateImportRow(validRow({ Attributes: "Colour:White;Colour:Red" }), 2);
    expect(issues.some((issue) => issue.column === "Attributes")).toBe(true);
  });

  it("generates a label from attributes when the label cell is blank", () => {
    const { value } = validateImportRow(validRow({ "Variant label": "", Attributes: "Colour:Red;Size:Large" }), 2);
    expect(value?.label).toBe("Red / Large");
  });

  it("defaults the label to Default with no attributes and a blank label", () => {
    const { value } = validateImportRow(validRow({ "Variant label": "", Attributes: "" }), 2);
    expect(value?.label).toBe("Default");
  });

  it("refuses a negative stock", () => {
    const { issues } = validateImportRow(validRow({ Stock: "-1" }), 2);
    expect(issues.some((issue) => issue.column === "Stock")).toBe(true);
  });

  it("refuses a non-boolean Variant active cell", () => {
    const { issues } = validateImportRow(validRow({ "Variant active": "maybe" }), 2);
    expect(issues).toContainEqual({ row: 2, column: "Variant active", message: "Use true or false." });
  });

  it("reports every problem in a row at once", () => {
    const { issues } = validateImportRow(validRow({ "Product name": "", Slug: "", Status: "bogus" }), 2);
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });
});
