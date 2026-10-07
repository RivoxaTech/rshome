import { describe, expect, it } from "vitest";
import { storyFor } from "./home-content";

describe("storyFor (D64)", () => {
  it("uses the hand-written override for a category the demo has custom copy for", () => {
    const story = storyFor({ slug: "tableware", name: "Tableware", description: "Elegant pieces." }, 0);
    expect(story).toMatchObject({ title: "Tableware, refined.", cta: "Shop Tableware →", reverse: false });
  });

  it("derives a real section from the category's own name/description when there's no override", () => {
    const story = storyFor({ slug: "wall-art", name: "Wall Art", description: "Statement pieces for any room." }, 1);
    expect(story).toEqual({
      eyebrow: "Wall Art",
      title: "Wall Art",
      copy: "Statement pieces for any room.",
      cta: "Shop Wall Art →",
      reverse: true,
      dark: false,
    });
  });

  it("alternates the image side by position, and never breaks on a missing description", () => {
    expect(storyFor({ slug: "new-one", name: "New One", description: null }, 0).reverse).toBe(false);
    expect(storyFor({ slug: "new-one", name: "New One", description: null }, 1).reverse).toBe(true);
    expect(storyFor({ slug: "new-one", name: "New One", description: null }, 2).reverse).toBe(false);
    expect(storyFor({ slug: "new-one", name: "New One", description: null }, 0).copy).toBe("");
  });
});
