import { describe, expect, it } from "vitest";
import type { PageContent } from "@/features/pages/schema";
import { buildPageMetadata, buildStorefrontMetadata, canonicalUrl, mediaImageUrl } from "./metadata";

const APP_URL = "https://rshome.example";

describe("canonicalUrl", () => {
  it("builds the root path with no trailing slash", () => {
    expect(canonicalUrl(APP_URL, "/")).toBe("https://rshome.example");
  });

  it("joins a path consistently however it's spelled", () => {
    expect(canonicalUrl(APP_URL, "/shop")).toBe("https://rshome.example/shop");
    expect(canonicalUrl(APP_URL, "shop")).toBe("https://rshome.example/shop");
    expect(canonicalUrl(APP_URL, "/shop/")).toBe("https://rshome.example/shop");
  });

  it("strips a trailing slash from APP_URL itself", () => {
    expect(canonicalUrl("https://rshome.example/", "/about")).toBe("https://rshome.example/about");
  });
});

describe("mediaImageUrl", () => {
  it("matches the image loader's URL shape", () => {
    expect(mediaImageUrl(APP_URL, "categories/abc123", 1200)).toBe("https://rshome.example/media/categories/abc123-1200.webp");
  });

  it("defaults to the largest available size", () => {
    expect(mediaImageUrl(APP_URL, "products/abc123")).toBe("https://rshome.example/media/products/abc123-1200.webp");
  });
});

describe("buildStorefrontMetadata", () => {
  it("sets the canonical alternate and matching Open Graph url", () => {
    const metadata = buildStorefrontMetadata({ appUrl: APP_URL, path: "/shop", title: "Shop", description: "Browse everything." });
    expect(metadata.alternates?.canonical).toBe("https://rshome.example/shop");
    expect(metadata.openGraph).toMatchObject({ url: "https://rshome.example/shop", type: "website" });
  });

  it("omits Open Graph/Twitter images when none is given, never inventing one", () => {
    const metadata = buildStorefrontMetadata({ appUrl: APP_URL, path: "/shop", title: "Shop", description: "Browse everything." });
    expect(metadata.openGraph).not.toHaveProperty("images");
    expect(metadata.twitter).toMatchObject({ card: "summary" });
  });

  it("includes the image and switches to a large Twitter card when one is given", () => {
    const metadata = buildStorefrontMetadata({
      appUrl: APP_URL,
      path: "/product/tray",
      title: "Tray",
      description: "A tray.",
      image: "https://rshome.example/media/products/abc-1200.webp",
    });
    expect(metadata.openGraph?.images).toEqual([{ url: "https://rshome.example/media/products/abc-1200.webp" }]);
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });
});

describe("buildPageMetadata", () => {
  it("builds metadata from a content-file page with no image", () => {
    const page: PageContent = { slug: "about", title: "About RS Home", metaDescription: "Our story.", blocks: [] };
    const metadata = buildPageMetadata(page, APP_URL);
    expect(metadata.title).toBe("About RS Home");
    expect(metadata.alternates?.canonical).toBe("https://rshome.example/about");
    expect(metadata.openGraph).not.toHaveProperty("images");
  });
});
