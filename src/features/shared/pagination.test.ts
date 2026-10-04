import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, pageCountOf, pageSizeField } from "./pagination";

describe("pageSizeField", () => {
  it("accepts each option, as a string from the URL or a number", () => {
    for (const size of PAGE_SIZE_OPTIONS) {
      expect(pageSizeField.parse(String(size))).toBe(size);
      expect(pageSizeField.parse(size)).toBe(size);
    }
  });

  it("falls back to the default for anything else, including a repeated key's later values", () => {
    expect(pageSizeField.parse("30")).toBe(DEFAULT_PAGE_SIZE);
    expect(pageSizeField.parse("abc")).toBe(DEFAULT_PAGE_SIZE);
    expect(pageSizeField.parse(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(pageSizeField.parse(["50", "100"])).toBe(50);
  });
});

describe("pageCountOf", () => {
  it("rounds up and never returns less than one page", () => {
    expect(pageCountOf(0, 25)).toBe(1);
    expect(pageCountOf(25, 25)).toBe(1);
    expect(pageCountOf(26, 25)).toBe(2);
    expect(pageCountOf(101, 50)).toBe(3);
  });
});
