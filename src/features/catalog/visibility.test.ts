import { describe, expect, it } from "vitest";
import { isCategoryVisible, visibleCategoryIds, type CategoryNode } from "./visibility";

function node(id: number, parentId: number | null, isActive: boolean): CategoryNode {
  return { id, parentId, isActive };
}

describe("isCategoryVisible / visibleCategoryIds", () => {
  it("shows a top-level active category", () => {
    const trays = node(1, null, true);
    expect(isCategoryVisible(trays, new Map([[1, trays]]))).toBe(true);
  });

  it("hides a top-level inactive category", () => {
    const trays = node(1, null, false);
    expect(isCategoryVisible(trays, new Map([[1, trays]]))).toBe(false);
  });

  it("hides an active child whose parent is hidden", () => {
    const parent = node(1, null, false);
    const child = node(2, 1, true);
    const byId = new Map([[1, parent], [2, child]]);
    expect(isCategoryVisible(child, byId)).toBe(false);
    // The child's own is_active flag is untouched by this rule.
    expect(child.isActive).toBe(true);
  });

  it("shows an active child of an active parent", () => {
    const parent = node(1, null, true);
    const child = node(2, 1, true);
    const byId = new Map([[1, parent], [2, child]]);
    expect(isCategoryVisible(child, byId)).toBe(true);
  });

  it("hides an inactive child even under an active parent", () => {
    const parent = node(1, null, true);
    const child = node(2, 1, false);
    const byId = new Map([[1, parent], [2, child]]);
    expect(isCategoryVisible(child, byId)).toBe(false);
  });

  it("treats a dangling parent reference as hidden", () => {
    const orphan = node(2, 999, true);
    expect(isCategoryVisible(orphan, new Map([[2, orphan]]))).toBe(false);
  });

  it("visibleCategoryIds returns only the visible ids, order-independent", () => {
    const categories = [node(1, null, true), node(2, 1, true), node(3, null, false), node(4, 3, true)];
    expect(visibleCategoryIds(categories)).toEqual(new Set([1, 2]));
  });
});
