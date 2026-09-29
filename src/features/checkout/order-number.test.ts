import { describe, expect, it } from "vitest";
import { ORDER_NUMBER_ALPHABET, generateOrderNumber, orderDateStamp } from "./order-number";

describe("orderDateStamp", () => {
  it("uses the Karachi date, not UTC", () => {
    // 20:30 UTC on the 29th is 01:30 on the 30th in Karachi (UTC+5).
    expect(orderDateStamp(new Date("2026-09-29T20:30:00Z"))).toBe("260930");
    expect(orderDateStamp(new Date("2026-09-29T12:00:00Z"))).toBe("260929");
  });
});

describe("generateOrderNumber", () => {
  it("matches RSH-YYMMDD-XXXX with the unambiguous alphabet", () => {
    const number = generateOrderNumber(new Date("2026-09-29T12:00:00Z"), (max) => Math.floor(Math.random() * max));
    expect(number).toMatch(/^RSH-260929-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
  });

  it("draws every suffix character from the random index", () => {
    expect(generateOrderNumber(new Date("2026-09-29T12:00:00Z"), () => 0)).toBe("RSH-260929-2222");
    expect(generateOrderNumber(new Date("2026-09-29T12:00:00Z"), (max) => max - 1)).toBe("RSH-260929-ZZZZ");
    expect(ORDER_NUMBER_ALPHABET).not.toMatch(/[01OIL]/);
  });
});
