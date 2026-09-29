import { describe, expect, it } from "vitest";
import { encodeOrderAccess } from "@/features/checkout/order-access";
import { decodeProofToken, encodeProofToken } from "./proof-token";

const SECRET = "test-secret-that-is-long-enough-for-hmac";
const NOW = new Date("2026-09-29T12:00:00Z");
const LATER = new Date("2026-09-29T13:00:00Z");
const FILE = "0123456789abcdef0123456789abcdef";

describe("checkout proof token", () => {
  it("round-trips the pending file name when signed with the same secret", () => {
    expect(decodeProofToken(encodeProofToken(FILE, LATER, SECRET), SECRET, NOW)).toBe(FILE);
  });

  it("rejects a tampered payload, a wrong secret and a malformed value", () => {
    const token = encodeProofToken(FILE, LATER, SECRET);
    const [, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ f: "f".repeat(32), e: LATER.getTime() })).toString("base64url");
    expect(decodeProofToken(`${forged}.${signature}`, SECRET, NOW)).toBeNull();
    expect(decodeProofToken(token, "another-secret-that-is-also-long-enough", NOW)).toBeNull();
    expect(decodeProofToken("not-a-token", SECRET, NOW)).toBeNull();
    expect(decodeProofToken(`${token}.extra`, SECRET, NOW)).toBeNull();
  });

  it("rejects an expired token even with a valid signature", () => {
    expect(decodeProofToken(encodeProofToken(FILE, NOW, SECRET), SECRET, NOW)).toBeNull();
  });

  it("never names a path: only a 32-character hex name passes", () => {
    expect(decodeProofToken(encodeProofToken("../../etc/passwd", LATER, SECRET), SECRET, NOW)).toBeNull();
  });

  it("does not accept an order-access cookie value signed with the same secret", () => {
    expect(decodeProofToken(encodeOrderAccess([FILE], LATER, SECRET), SECRET, NOW)).toBeNull();
  });
});
