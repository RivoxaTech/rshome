import { describe, expect, it } from "vitest";
import { insertId, moveId, renormalize, reorderScope, resolvePlacementIndex } from "./ordering";

describe("resolvePlacementIndex", () => {
  it("top is always index 0", () => {
    expect(resolvePlacementIndex(5, { type: "top" })).toBe(0);
    expect(resolvePlacementIndex(0, { type: "top" })).toBe(0);
  });

  it("end is the current length", () => {
    expect(resolvePlacementIndex(5, { type: "end" })).toBe(5);
    expect(resolvePlacementIndex(0, { type: "end" })).toBe(0);
  });

  it("position is 1-based, converted to a 0-based index", () => {
    expect(resolvePlacementIndex(5, { type: "position", position: 1 })).toBe(0);
    expect(resolvePlacementIndex(5, { type: "position", position: 3 })).toBe(2);
  });

  it("clamps an out-of-range position into [0, length]", () => {
    expect(resolvePlacementIndex(5, { type: "position", position: 0 })).toBe(0);
    expect(resolvePlacementIndex(5, { type: "position", position: -10 })).toBe(0);
    expect(resolvePlacementIndex(5, { type: "position", position: 999 })).toBe(5);
  });
});

describe("insertId", () => {
  it("inserts at top", () => {
    expect(insertId([1, 2, 3], 9, { type: "top" })).toEqual([9, 1, 2, 3]);
  });

  it("inserts at end", () => {
    expect(insertId([1, 2, 3], 9, { type: "end" })).toEqual([1, 2, 3, 9]);
  });

  it("inserts at a position", () => {
    expect(insertId([1, 2, 3], 9, { type: "position", position: 2 })).toEqual([1, 9, 2, 3]);
  });
});

describe("moveId", () => {
  it("moves an existing id to the top", () => {
    expect(moveId([1, 2, 3, 4], 3, { type: "top" })).toEqual([3, 1, 2, 4]);
  });

  it("moves an existing id to the end", () => {
    expect(moveId([1, 2, 3, 4], 2, { type: "end" })).toEqual([1, 3, 4, 2]);
  });

  it("moves an existing id to a position, reshuffling everything after the gap", () => {
    expect(moveId([1, 2, 3, 4, 5], 5, { type: "position", position: 2 })).toEqual([1, 5, 2, 3, 4]);
  });

  it("is a no-op shape when moved to its own position", () => {
    expect(moveId([1, 2, 3], 2, { type: "position", position: 2 })).toEqual([1, 2, 3]);
  });
});

describe("reorderScope", () => {
  it("writes the new scope order into exactly the scope's original slots, leaving every other id's index untouched", () => {
    // ids 2, 4, 6 are "category A"; 1, 3, 5 are everything else, interleaved.
    const full = [1, 2, 3, 4, 5, 6];
    const scope = new Set([2, 4, 6]);
    const result = reorderScope(full, scope, [6, 2, 4]);
    expect(result).toEqual([1, 6, 3, 2, 5, 4]);
    // non-scope ids kept the exact same index they started at.
    expect(result[0]).toBe(1);
    expect(result[2]).toBe(3);
    expect(result[4]).toBe(5);
  });

  it("renormalizing before and after shows non-scope ids keep the same value", () => {
    const full = [10, 20, 30, 40];
    const scope = new Set([10, 30]);
    const before = renormalize(full);
    const after = renormalize(reorderScope(full, scope, [30, 10]));
    expect(after.get(20)).toBe(before.get(20));
    expect(after.get(40)).toBe(before.get(40));
    expect(after.get(10)).toBe(2);
    expect(after.get(30)).toBe(0);
  });

  it("supports a scope of the whole list (no non-scope ids to preserve)", () => {
    const full = [1, 2, 3];
    const result = reorderScope(full, new Set(full), [3, 1, 2]);
    expect(result).toEqual([3, 1, 2]);
  });
});

describe("renormalize", () => {
  it("maps each id to its 0-based index", () => {
    const map = renormalize([7, 3, 9]);
    expect(map.get(7)).toBe(0);
    expect(map.get(3)).toBe(1);
    expect(map.get(9)).toBe(2);
  });

  it("returns an empty map for an empty list", () => {
    expect(renormalize([]).size).toBe(0);
  });
});
