import { describe, expect, it } from "vitest";
import {
  buildBreadcrumbJsonLd,
  buildOrganizationJsonLd,
  buildProductJsonLd,
  productAvailability,
  serializeJsonLd,
} from "./jsonld";

describe("serializeJsonLd", () => {
  it("escapes < so a value can never close the script tag early", () => {
    const serialized = serializeJsonLd({ name: '</script><script>alert(1)</script>' });
    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script>");
  });
});

describe("productAvailability", () => {
  it("maps every stock state to its schema.org value", () => {
    expect(productAvailability("in_stock")).toBe("InStock");
    expect(productAvailability("low_stock")).toBe("LimitedAvailability");
    expect(productAvailability("sold_out")).toBe("OutOfStock");
  });
});

describe("buildProductJsonLd", () => {
  const base = { name: "Rose Gold Tray", description: "A decorative tray.", url: "https://example.com/product/tray", sku: "TRAY-1", price: "2500.00", availability: "InStock" as const };

  it("includes the discounted price, sku and availability in one Offer", () => {
    const jsonLd = buildProductJsonLd({ ...base, images: ["https://example.com/media/tray-1200.webp"] });
    expect(jsonLd).toMatchObject({
      "@type": "Product",
      name: "Rose Gold Tray",
      sku: "TRAY-1",
      image: ["https://example.com/media/tray-1200.webp"],
      offers: { "@type": "Offer", priceCurrency: "PKR", price: "2500.00", availability: "https://schema.org/InStock" },
    });
  });

  it("maps OutOfStock and LimitedAvailability to their schema.org URLs", () => {
    expect((buildProductJsonLd({ ...base, images: [], availability: "OutOfStock" }).offers as { availability: string }).availability).toBe(
      "https://schema.org/OutOfStock",
    );
    expect((buildProductJsonLd({ ...base, images: [], availability: "LimitedAvailability" }).offers as { availability: string }).availability).toBe(
      "https://schema.org/LimitedAvailability",
    );
  });

  it("omits the image field entirely when there are no images", () => {
    const jsonLd = buildProductJsonLd({ ...base, images: [] });
    expect(jsonLd).not.toHaveProperty("image");
  });
});

describe("buildBreadcrumbJsonLd", () => {
  it("numbers each item by its position", () => {
    const jsonLd = buildBreadcrumbJsonLd([
      { name: "Shop", url: "https://example.com/shop" },
      { name: "Trays", url: "https://example.com/category/trays" },
    ]);
    expect(jsonLd.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Shop", item: "https://example.com/shop" },
      { "@type": "ListItem", position: 2, name: "Trays", item: "https://example.com/category/trays" },
    ]);
  });
});

describe("buildOrganizationJsonLd", () => {
  it("includes sameAs only from non-blank social links, and omits a missing phone", () => {
    const jsonLd = buildOrganizationJsonLd({ name: "RS Home", url: "https://example.com", telephone: null, sameAs: ["https://facebook.com/rshome"] });
    expect(jsonLd).not.toHaveProperty("telephone");
    expect(jsonLd.sameAs).toEqual(["https://facebook.com/rshome"]);
  });

  it("omits sameAs entirely when every social link is blank", () => {
    const jsonLd = buildOrganizationJsonLd({ name: "RS Home", url: "https://example.com", telephone: "0321", sameAs: [] });
    expect(jsonLd).not.toHaveProperty("sameAs");
  });
});
