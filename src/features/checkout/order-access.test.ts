import { describe, expect, it } from "vitest";
import { ORDER_ACCESS_MAX_ORDERS, decodeOrderAccess, encodeOrderAccess, withOrderAccess } from "./order-access";

const SECRET = "test-secret-that-is-long-enough-for-hmac";
const NOW = new Date("2026-09-29T12:00:00Z");
const LATER = new Date("2026-10-29T12:00:00Z");

describe("order access cookie value", () => {
  it("round-trips the order numbers when signed with the same secret", () => {
    const value = encodeOrderAccess(["RSH-260929-ABCD", "RSH-260928-WXYZ"], LATER, SECRET);
    expect(decodeOrderAccess(value, SECRET, NOW)).toEqual(["RSH-260929-ABCD", "RSH-260928-WXYZ"]);
  });

  it("grants nothing without a cookie, so the order page redirects to /track", () => {
    expect(decodeOrderAccess(undefined, SECRET, NOW)).toEqual([]);
    expect(decodeOrderAccess("", SECRET, NOW)).toEqual([]);
  });

  it("rejects a tampered payload, a wrong secret and a malformed value", () => {
    const value = encodeOrderAccess(["RSH-260929-ABCD"], LATER, SECRET);
    const [, signature] = value.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ o: ["RSH-260929-ZZZZ"], e: LATER.getTime() })).toString("base64url");
    expect(decodeOrderAccess(`${forgedBody}.${signature}`, SECRET, NOW)).toEqual([]);
    expect(decodeOrderAccess(value, "another-secret-that-is-also-long-enough", NOW)).toEqual([]);
    expect(decodeOrderAccess("not-a-cookie", SECRET, NOW)).toEqual([]);
    expect(decodeOrderAccess(`${value}.extra`, SECRET, NOW)).toEqual([]);
  });

  it("rejects an expired value even with a valid signature", () => {
    const value = encodeOrderAccess(["RSH-260929-ABCD"], NOW, SECRET);
    expect(decodeOrderAccess(value, SECRET, NOW)).toEqual([]);
  });
});

describe("withOrderAccess", () => {
  it("puts the new order first, drops a duplicate and keeps at most 20", () => {
    expect(withOrderAccess(["A", "B"], "C")).toEqual(["C", "A", "B"]);
    expect(withOrderAccess(["A", "B"], "B")).toEqual(["B", "A"]);

    const twenty = Array.from({ length: ORDER_ACCESS_MAX_ORDERS }, (_, i) => `N${i}`);
    const result = withOrderAccess(twenty, "NEW");
    expect(result).toHaveLength(ORDER_ACCESS_MAX_ORDERS);
    expect(result[0]).toBe("NEW");
    expect(result).not.toContain("N19");
  });
});
