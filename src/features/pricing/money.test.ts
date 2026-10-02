import { describe, expect, it } from "vitest";
import { decimalToPaisa, formatMoney, paisaToDecimal, percentPriceChange } from "./money";

describe("decimalToPaisa", () => {
  it("converts a whole-rupee decimal", () => {
    expect(decimalToPaisa("4500.00")).toBe(450000);
  });

  it("converts a fractional decimal", () => {
    expect(decimalToPaisa("99.50")).toBe(9950);
  });

  it("pads a single fraction digit", () => {
    expect(decimalToPaisa("10.5")).toBe(1050);
  });

  it("handles no fraction at all", () => {
    expect(decimalToPaisa("10")).toBe(1000);
  });

  it("handles a negative amount", () => {
    expect(decimalToPaisa("-50.25")).toBe(-5025);
  });
});

describe("paisaToDecimal", () => {
  it("round-trips a whole-rupee amount", () => {
    expect(paisaToDecimal(450000)).toBe("4500.00");
  });

  it("round-trips a fractional amount", () => {
    expect(paisaToDecimal(9950)).toBe("99.50");
  });

  it("round-trips a negative amount", () => {
    expect(paisaToDecimal(-5025)).toBe("-50.25");
  });
});

describe("formatMoney", () => {
  it("formats whole rupees with thousands separators", () => {
    expect(formatMoney(450000)).toBe("PKR 4,500");
  });

  it("rounds half up to the nearest rupee", () => {
    expect(formatMoney(450050)).toBe("PKR 4,501");
    expect(formatMoney(450049)).toBe("PKR 4,500");
  });
});

describe("percentPriceChange", () => {
  it("is null with no old price to compare against", () => {
    expect(percentPriceChange(0, 150000)).toBeNull();
  });

  it("is positive for an increase and negative for a decrease", () => {
    expect(percentPriceChange(100000, 150000)).toBe(50);
    expect(percentPriceChange(100000, 50000)).toBe(-50);
  });

  it("sits exactly at the 50% boundary either way", () => {
    expect(percentPriceChange(100000, 150000)).toBe(50);
    expect(percentPriceChange(100000, 150001)).toBeCloseTo(50.001, 2);
    expect(percentPriceChange(100000, 149999)).toBeCloseTo(49.999, 2);
  });

  it("is zero for an unchanged price", () => {
    expect(percentPriceChange(100000, 100000)).toBe(0);
  });
});
