import { describe, expect, it } from "vitest";
import { copyrightLine } from "./copyright";

describe("copyrightLine", () => {
  it("rolls over at Karachi midnight, not UTC midnight: 31 Dec 23:59 UTC is already 1 Jan in Karachi", () => {
    expect(copyrightLine("RS Home", new Date("2023-12-31T23:59:00Z"))).toBe("© 2024 RS Home. All rights reserved.");
  });

  it("a plain 1 Jan instant uses that year", () => {
    expect(copyrightLine("RS Home", new Date("2024-01-01T00:00:00Z"))).toBe("© 2024 RS Home. All rights reserved.");
  });

  it("uses the given store name", () => {
    expect(copyrightLine("Reema Home", new Date("2026-06-15T12:00:00Z"))).toBe("© 2026 Reema Home. All rights reserved.");
  });
});
