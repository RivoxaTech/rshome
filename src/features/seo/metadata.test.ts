import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HERO_IMAGES } from "@/config/home-content";
import type { PageContent } from "@/features/pages/schema";
import { AVAILABLE_WIDTHS, staticImagePath } from "@/lib/image-loader";
import { buildPageMetadata, buildStorefrontMetadata, canonicalUrl, mediaImageUrl } from "./metadata";

const APP_URL = "https://rshome.example";

describe("home page Open Graph image (S22 HERO-01)", () => {
  it("is the hero's largest static file, as an absolute URL", () => {
    expect(canonicalUrl(APP_URL, staticImagePath(HERO_IMAGES.main, HERO_IMAGES.main.width))).toBe("https://rshome.example/hero/hero-main-1200.webp");
  });

  it("every hero file the loader can name exists in public/", () => {
    for (const image of Object.values(HERO_IMAGES)) {
      for (const width of AVAILABLE_WIDTHS) {
        const file = path.join(process.cwd(), "public", staticImagePath(image, width));
        expect(existsSync(file), file).toBe(true);
      }
      expect(image.width).toBe(AVAILABLE_WIDTHS.at(-1));
    }
  });
});

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
