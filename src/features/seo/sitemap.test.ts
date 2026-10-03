import { describe, expect, it } from "vitest";
import { buildSitemapEntries } from "./sitemap";

const APP_URL = "https://rshome.example";

const baseInput = {
  appUrl: APP_URL,
  categories: [{ slug: "trays" }],
  products: [{ slug: "rose-gold-tray", updatedAt: new Date("2026-10-01T00:00:00Z") }],
  pages: [{ slug: "about" }],
  wholesaleEnabled: false,
};

describe("buildSitemapEntries", () => {
  it("always includes home and shop", () => {
    const urls = buildSitemapEntries(baseInput).map((entry) => entry.url);
    expect(urls).toContain("https://rshome.example");
    expect(urls).toContain("https://rshome.example/shop");
  });

  it("includes every category and product passed in, with the product's lastModified", () => {
    const entries = buildSitemapEntries(baseInput);
    expect(entries).toContainEqual(expect.objectContaining({ url: "https://rshome.example/category/trays" }));
    expect(entries).toContainEqual(
      expect.objectContaining({ url: "https://rshome.example/product/rose-gold-tray", lastModified: baseInput.products[0].updatedAt }),
    );
  });

  it("never invents a draft/archived or hidden-category product — it only reflects what the caller passed in", () => {
    const urls = buildSitemapEntries({ ...baseInput, products: [] }).map((entry) => entry.url);
    expect(urls).not.toContain("https://rshome.example/product/rose-gold-tray");
  });

  it("includes every content page from src/content/pages.ts", () => {
    const urls = buildSitemapEntries(baseInput).map((entry) => entry.url);
    expect(urls).toContain("https://rshome.example/about");
  });

  it("includes /wholesale only when the feature flag is on", () => {
    expect(buildSitemapEntries({ ...baseInput, wholesaleEnabled: false }).map((entry) => entry.url)).not.toContain(
      "https://rshome.example/wholesale",
    );
    expect(buildSitemapEntries({ ...baseInput, wholesaleEnabled: true }).map((entry) => entry.url)).toContain(
      "https://rshome.example/wholesale",
    );
  });
});
