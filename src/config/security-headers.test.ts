import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY, SECURITY_HEADERS, STRICT_TRANSPORT_SECURITY } from "./security-headers";

const directives = Object.fromEntries(CONTENT_SECURITY_POLICY.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)]));

describe("security headers (S22 SEC-02)", () => {
  it("sends every header the hardening policy names, once each", () => {
    const keys = SECURITY_HEADERS.map((h) => h.key);
    expect(keys).toEqual(["Content-Security-Policy", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security"]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(SECURITY_HEADERS.find((h) => h.key === "X-Frame-Options")?.value).toBe("DENY");
    expect(SECURITY_HEADERS.find((h) => h.key === "X-Content-Type-Options")?.value).toBe("nosniff");
    expect(SECURITY_HEADERS.find((h) => h.key === "Referrer-Policy")?.value).toBe("strict-origin-when-cross-origin");
  });

  it("the CSP blocks framing, foreign scripts, objects and off-site form posts", () => {
    expect(directives["frame-ancestors"]).toEqual(["'none'"]);
    expect(directives["object-src"]).toEqual(["'none'"]);
    expect(directives["base-uri"]).toEqual(["'self'"]);
    expect(directives["form-action"]).toEqual(["'self'"]);
    expect(directives["default-src"]).toEqual(["'self'"]);
    for (const value of Object.values(directives).flat()) expect(value).not.toMatch(/^https?:\/\//);
  });

  it("allows exactly what the app needs: inline scripts/styles, blob previews, the service worker, self-hosted fonts", () => {
    expect(directives["script-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directives["style-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directives["img-src"]).toEqual(["'self'", "blob:"]);
    expect(directives["img-src"]).not.toContain("data:");
    expect(directives["worker-src"]).toEqual(["'self'"]);
    expect(directives["font-src"]).toEqual(["'self'"]);
    expect(directives["connect-src"]).toEqual(["'self'"]);
    expect(directives["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("HSTS is 180 days without includeSubDomains or preload (owner decision)", () => {
    expect(STRICT_TRANSPORT_SECURITY).toBe("max-age=15552000");
  });
});
