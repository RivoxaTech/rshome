import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("turns every spelling of a Pakistani mobile into 923XXXXXXXXX", () => {
    expect(normalizePhone("03218581969")).toBe("923218581969");
    expect(normalizePhone("0321 8581969")).toBe("923218581969");
    expect(normalizePhone("0321-858-1969")).toBe("923218581969");
    expect(normalizePhone("+92 321 8581969")).toBe("923218581969");
    expect(normalizePhone("+92 (321) 858.1969")).toBe("923218581969");
    expect(normalizePhone("923218581969")).toBe("923218581969");
    expect(normalizePhone("0092 321 8581969")).toBe("923218581969");
    expect(normalizePhone("92 0321 8581969")).toBe("923218581969");
  });

  it("keeps an international number's digits with its country code", () => {
    expect(normalizePhone("+44 7911 123456")).toBe("447911123456");
    expect(normalizePhone("+1 (415) 555-2671")).toBe("14155552671");
    expect(normalizePhone("00971 50 123 4567")).toBe("971501234567");
  });

  it("rejects a local number outside Pakistan (no country code to add)", () => {
    expect(normalizePhone("07911 123456")).toBeNull();
    expect(normalizePhone("050 123 4567")).toBeNull();
  });

  it("rejects letters, too few and too many digits", () => {
    expect(normalizePhone("call me")).toBeNull();
    expect(normalizePhone("+92 321")).toBeNull();
    expect(normalizePhone("1234567")).toBeNull();
    expect(normalizePhone("1234567890123456")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("formatPhone", () => {
  it("formats a Pakistani mobile with its groups and anything else with a plus", () => {
    expect(formatPhone("923218581969")).toBe("+92 321 8581969");
    expect(formatPhone("447911123456")).toBe("+447911123456");
  });
});
