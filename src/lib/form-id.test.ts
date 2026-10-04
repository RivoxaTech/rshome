import { describe, expect, it } from "vitest";
import { parseFormId } from "./form-id";

describe("parseFormId", () => {
  it("accepts a positive integer as a form posts it", () => {
    expect(parseFormId("42")).toBe(42);
    expect(parseFormId("1")).toBe(1);
  });

  it("returns null for anything tampered, so NaN never reaches a query", () => {
    for (const value of [null, "", "abc", "0", "-3", "1.5", "NaN", "Infinity", "7; drop"]) {
      expect(parseFormId(value), String(value)).toBeNull();
    }
  });
});
