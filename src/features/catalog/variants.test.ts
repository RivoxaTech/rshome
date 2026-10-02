import { describe, expect, it } from "vitest";
import { moveId, renormalize } from "./ordering";
import { variantInputSchema } from "./schemas";
import { MAX_VARIANT_ATTRIBUTES, attributesKey, generateVariantLabel, parseVariantAttributes, sameAttributes, validateAttributePairs } from "./variants";

describe("validateAttributePairs", () => {
  it("trims keys and values and skips fully empty rows", () => {
    const result = validateAttributePairs([
      { key: " Colour ", value: " Red " },
      { key: "", value: "" },
      { key: "Size", value: "Large" },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.attributes).toEqual({ Colour: "Red", Size: "Large" });
  });

  it("refuses a half-filled row on the empty side", () => {
    const result = validateAttributePairs([
      { key: "", value: "Red" },
      { key: "Size", value: " " },
    ]);
    expect(result.errors).toEqual([
      { index: 0, field: "key", message: "Enter an attribute name." },
      { index: 1, field: "value", message: "Enter a value." },
    ]);
    expect(result.attributes).toEqual({});
  });

  it("refuses a duplicate name, case-insensitively, keeping the first", () => {
    const result = validateAttributePairs([
      { key: "Colour", value: "Red" },
      { key: "colour", value: "Blue" },
    ]);
    expect(result.errors).toEqual([{ index: 1, field: "key", message: "Each attribute name can only be used once." }]);
    expect(result.attributes).toEqual({ Colour: "Red" });
  });

  it(`refuses more than ${MAX_VARIANT_ATTRIBUTES} pairs`, () => {
    const pairs = Array.from({ length: MAX_VARIANT_ATTRIBUTES + 1 }, (_, index) => ({ key: `Attr${index}`, value: `v${index}` }));
    const result = validateAttributePairs(pairs);
    expect(result.errors).toEqual([{ index: MAX_VARIANT_ATTRIBUTES, field: "key", message: `Up to ${MAX_VARIANT_ATTRIBUTES} attributes per variant.` }]);
    expect(Object.keys(result.attributes)).toHaveLength(MAX_VARIANT_ATTRIBUTES);
  });
});

describe("generateVariantLabel", () => {
  it("joins the attribute values in order with ' / '", () => {
    expect(generateVariantLabel({ Colour: "Red", Size: "Large" })).toBe("Red / Large");
  });

  it("is 'Default' with no attributes", () => {
    expect(generateVariantLabel({})).toBe("Default");
  });
});

describe("sameAttributes / attributesKey", () => {
  it("ignores key order and case", () => {
    expect(sameAttributes({ Colour: "Red", Size: "L" }, { size: "l", colour: "RED" })).toBe(true);
    expect(attributesKey({ Colour: "Red" })).toBe("colour=red");
  });

  it("differs when any value differs", () => {
    expect(sameAttributes({ Colour: "Red" }, { Colour: "Blue" })).toBe(false);
    expect(sameAttributes({ Colour: "Red" }, { Colour: "Red", Size: "L" })).toBe(false);
  });

  it("two empty sets (two 'Default' variants) count as identical", () => {
    expect(sameAttributes({}, {})).toBe(true);
  });
});

describe("parseVariantAttributes", () => {
  it("reads the stored JSON and tolerates garbage", () => {
    expect(parseVariantAttributes('{"Colour":"Red"}')).toEqual({ Colour: "Red" });
    expect(parseVariantAttributes("not json")).toEqual({});
    expect(parseVariantAttributes('{"Colour":1}')).toEqual({});
  });
});

/** The dialog's literal field names, exactly as a browser submit (or the Server Action) posts them. */
const validVariant = {
  label: "",
  sku: "RSH-RED-L",
  priceOverride: "",
  stock: "4",
  weightGrams: "",
  isActive: "true",
  attributeKey0: "Colour",
  attributeValue0: "Red",
  attributeKey1: "Size",
  attributeValue1: "Large",
};

describe("variantInputSchema", () => {
  it("collects the indexed attribute fields and generates the label when blank", () => {
    const result = variantInputSchema.safeParse(validVariant);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      label: "Red / Large",
      sku: "RSH-RED-L",
      priceOverride: null,
      stock: 4,
      weightGrams: null,
      isActive: true,
      attributes: { Colour: "Red", Size: "Large" },
    });
  });

  it("keeps a typed label and normalises a price override to DECIMAL(12,2)", () => {
    const result = variantInputSchema.safeParse({ ...validVariant, label: " Crimson, large ", priceOverride: "999.5", weightGrams: "250" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.label).toBe("Crimson, large");
    expect(result.data.priceOverride).toBe("999.50");
    expect(result.data.weightGrams).toBe(250);
  });

  it("a variant with no attributes is labelled 'Default'", () => {
    const result = variantInputSchema.safeParse({ ...validVariant, attributeKey0: "", attributeValue0: "", attributeKey1: "", attributeValue1: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toMatchObject({ label: "Default", attributes: {} });
  });

  it("reports attribute errors on the exact row field", () => {
    const result = variantInputSchema.safeParse({ ...validVariant, attributeKey1: "colour", attributeKey2: "", attributeValue2: "orphan value" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const paths = result.error.issues.map((issue) => issue.path.join("."));
    expect(paths).toContain("attributeKey1");
    expect(paths).toContain("attributeKey2");
  });

  it("requires a SKU and a non-negative integer stock", () => {
    expect(variantInputSchema.safeParse({ ...validVariant, sku: " " }).success).toBe(false);
    expect(variantInputSchema.safeParse({ ...validVariant, stock: "-1" }).success).toBe(false);
    expect(variantInputSchema.safeParse({ ...validVariant, stock: "1.5" }).success).toBe(false);
  });

  it("isActive reads the Switch's 'true'/'false' hidden input", () => {
    const result = variantInputSchema.safeParse({ ...validVariant, isActive: "false" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isActive).toBe(false);
  });
});

describe("position helpers reused for variants", () => {
  it("moveId + renormalize give dense 0-based positions with no duplicates", () => {
    const next = moveId([11, 12, 13, 14], 14, { type: "position", position: 2 });
    expect(next).toEqual([11, 14, 12, 13]);
    const positions = renormalize(next);
    expect([...positions.values()]).toEqual([0, 1, 2, 3]);
  });
});
