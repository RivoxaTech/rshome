import { describe, expect, it } from "vitest";
import imageLoader, { nearestAvailableWidth } from "./image-loader";

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
