import { describe, expect, it } from "vitest";
import { generateSlug, SLUG_PATTERN } from "./slug";

describe("generateSlug", () => {
  it("lowercases and dashes a plain name", () => {
    expect(generateSlug("Tea Sets")).toBe("tea-sets");
  });

  it("folds accented letters to plain ascii", () => {
    expect(generateSlug("Café Trays")).toBe("cafe-trays");
  });

  it("collapses runs of punctuation and whitespace into one dash", () => {
    expect(generateSlug("Trays &  Serving   Boards!")).toBe("trays-serving-boards");
  });

  it("trims leading and trailing dashes", () => {
    expect(generateSlug("  -Decor- ")).toBe("decor");
  });

  it("keeps digits", () => {
    expect(generateSlug("Set of 3")).toBe("set-of-3");
  });

  it("every generated slug matches the shared SLUG_PATTERN", () => {
    for (const name of ["Tea Sets", "Café Trays", "  -Decor- ", "Set of 3", "A", "100% Cotton"]) {
      const slug = generateSlug(name);
      if (slug) expect(slug).toMatch(SLUG_PATTERN);
    }
  });
});

describe("SLUG_PATTERN", () => {
  it("accepts lowercase, digits and single internal dashes", () => {
    expect(SLUG_PATTERN.test("tea-sets")).toBe(true);
    expect(SLUG_PATTERN.test("set-of-3")).toBe(true);
    expect(SLUG_PATTERN.test("a")).toBe(true);
  });

  it("rejects uppercase, spaces, leading/trailing or doubled dashes", () => {
    expect(SLUG_PATTERN.test("Tea-Sets")).toBe(false);
    expect(SLUG_PATTERN.test("tea sets")).toBe(false);
    expect(SLUG_PATTERN.test("-tea-sets")).toBe(false);
    expect(SLUG_PATTERN.test("tea-sets-")).toBe(false);
    expect(SLUG_PATTERN.test("tea--sets")).toBe(false);
    expect(SLUG_PATTERN.test("")).toBe(false);
  });
});
