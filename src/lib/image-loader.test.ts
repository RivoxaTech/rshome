import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import imageLoader, { AVAILABLE_WIDTHS, nearestAvailableWidth, staticImagePath } from "./image-loader";

describe("next.config images", () => {
  it("lists exactly the generated widths as srcset candidates, so no width maps to a duplicate file (S22 SPD-03)", () => {
    expect(nextConfig.images?.deviceSizes).toEqual([...AVAILABLE_WIDTHS]);
    expect(nextConfig.images?.imageSizes).toEqual([]);
  });
});

describe("nearestAvailableWidth", () => {
  it("maps an exact match to itself", () => {
    expect(nearestAvailableWidth(800)).toBe(800);
  });

  it("rounds down when closer to the smaller size", () => {
    expect(nearestAvailableWidth(500)).toBe(400);
  });

  it("rounds up when closer to the larger size", () => {
    expect(nearestAvailableWidth(700)).toBe(800);
  });

  it("clamps a very small request to the smallest size", () => {
    expect(nearestAvailableWidth(16)).toBe(400);
  });

  it("clamps a very large request to the largest size", () => {
    expect(nearestAvailableWidth(4000)).toBe(1200);
  });
});

describe("imageLoader", () => {
  it("builds a /media URL with the nearest size suffix", () => {
    expect(imageLoader({ src: "products/abc123", width: 640 })).toBe("/media/products/abc123-800.webp");
  });
});

describe("staticImagePath", () => {
  const image = { basePath: "/hero/hero-main" };

  it("maps a public/ image set to the same three widths as /media, so every srcset width is a real file", () => {
    for (const width of AVAILABLE_WIDTHS) expect(staticImagePath(image, width)).toBe(`/hero/hero-main-${width}.webp`);
    expect(staticImagePath(image, 375)).toBe("/hero/hero-main-400.webp");
    expect(staticImagePath(image, 2880)).toBe("/hero/hero-main-1200.webp");
  });
});
