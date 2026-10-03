import { describe, expect, it } from "vitest";
import { PAGES } from "@/content/pages";
import { isAllowedHref, validatePages, type PageContent } from "./schema";

function page(overrides: Partial<PageContent> = {}): PageContent {
  return {
    slug: "about",
    title: "About",
    metaDescription: "A short description.",
    blocks: [{ type: "paragraph", text: "Hello." }],
    ...overrides,
  };
}

describe("isAllowedHref", () => {
  it("allows https, mailto, tel and relative paths", () => {
    expect(isAllowedHref("https://example.com")).toBe(true);
    expect(isAllowedHref("mailto:hello@example.com")).toBe(true);
    expect(isAllowedHref("tel:+923218581969")).toBe(true);
    expect(isAllowedHref("/shop")).toBe(true);
  });

  it("rejects javascript:, data: and protocol-relative links", () => {
    expect(isAllowedHref("javascript:alert(1)")).toBe(false);
    expect(isAllowedHref("data:text/html,hi")).toBe(false);
    expect(isAllowedHref("//evil.example.com")).toBe(false);
    expect(isAllowedHref("http://example.com")).toBe(false);
  });
});

describe("validatePages", () => {
  it("accepts a well-formed page", () => {
    expect(validatePages([page()])).toEqual([]);
  });

  it("rejects a duplicate slug", () => {
    expect(validatePages([page(), page()])).toContain('"about": slug is not unique.');
  });

  it("rejects an uppercase or spaced slug", () => {
    expect(validatePages([page({ slug: "About Us" })])).toContain(
      '"About Us": slug must be lowercase letters, digits and single hyphens only.',
    );
  });

  it("rejects a title over 70 characters", () => {
    expect(validatePages([page({ title: "x".repeat(71) })])).toContain(
      '"about": title must be 1-70 characters (got 71).',
    );
  });

  it("rejects a meta description over 160 characters", () => {
    expect(validatePages([page({ metaDescription: "x".repeat(161) })])).toContain(
      '"about": metaDescription must be 1-160 characters (got 161).',
    );
  });

  it("rejects a page with no blocks", () => {
    expect(validatePages([page({ blocks: [] })])).toContain('"about": needs at least one block.');
  });

  it("rejects a link block with a disallowed href", () => {
    const withBadLink = page({ blocks: [{ type: "link", text: "Click me", href: "javascript:alert(1)" }] });
    expect(validatePages([withBadLink])).toContain('"about": link "Click me" has a disallowed href "javascript:alert(1)".');
  });

  it("rejects an em dash or en dash anywhere in a page's user-facing text", () => {
    expect(validatePages([page({ title: "About — Us" })])[0]).toMatch(/em dash or en dash/);
    expect(validatePages([page({ metaDescription: "Short info – details." })])[0]).toMatch(/em dash or en dash/);
    expect(validatePages([page({ blocks: [{ type: "paragraph", text: "Open –10am to 6pm." }] })])[0]).toMatch(/em dash or en dash/);
    expect(validatePages([page({ blocks: [{ type: "list", items: ["Fast delivery — nationwide"] }] })])[0]).toMatch(/em dash or en dash/);
    expect(validatePages([page({ blocks: [{ type: "link", text: "Read more — here", href: "/about" }] })])[0]).toMatch(/em dash or en dash/);
  });

  it("allows a plain hyphen inside a word", () => {
    expect(validatePages([page({ blocks: [{ type: "paragraph", text: "Bank-transfer and tea-sets are fine." }] })])).toEqual([]);
  });

  it("the real content file passes every rule", () => {
    expect(validatePages(PAGES)).toEqual([]);
  });
});
