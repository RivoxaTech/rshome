import { describe, expect, it } from "vitest";
import { paginate, sortProducts, type SortableProduct } from "./listing";

const items: SortableProduct[] = [
  { id: 1, createdAt: new Date("2026-09-01T00:00:00Z"), fromPrice: 50000, sortOrder: 3 },
  { id: 2, createdAt: new Date("2026-09-03T00:00:00Z"), fromPrice: 100000, sortOrder: 1 },
  { id: 3, createdAt: new Date("2026-09-02T00:00:00Z"), fromPrice: 200000, sortOrder: 0 },
  { id: 4, createdAt: new Date("2026-09-02T00:00:00Z"), fromPrice: 100000, sortOrder: 1 },
];

const ids = (list: SortableProduct[]) => list.map((item) => item.id);

describe("sortProducts", () => {
  it("sorts recommended by sortOrder ascending, ties newest first", () => {
    expect(ids(sortProducts(items, "recommended"))).toEqual([3, 2, 4, 1]);
  });

  it("sorts newest first, breaking equal times on the higher id", () => {
    expect(ids(sortProducts(items, "newest"))).toEqual([2, 4, 3, 1]);
  });

  it("sorts by price low to high, equal prices newest first", () => {
    expect(ids(sortProducts(items, "price_asc"))).toEqual([1, 2, 4, 3]);
  });

  it("sorts by price high to low, equal prices newest first", () => {
    expect(ids(sortProducts(items, "price_desc"))).toEqual([3, 2, 4, 1]);
  });

  it("does not mutate its input", () => {
    const copy = [...items];
    sortProducts(items, "price_desc");
    expect(items).toEqual(copy);
  });
});

describe("paginate", () => {
  it("computes the offset of a middle page", () => {
    expect(paginate(30, 2, 12)).toEqual({ page: 2, totalPages: 3, offset: 12 });
  });

  it("clamps a page past the end to the last page", () => {
    expect(paginate(30, 9, 12)).toEqual({ page: 3, totalPages: 3, offset: 24 });
  });

  it("clamps a page below 1 to the first page", () => {
    expect(paginate(30, 0, 12)).toEqual({ page: 1, totalPages: 3, offset: 0 });
  });

  it("has exactly one page when the items fill it", () => {
    expect(paginate(12, 1, 12).totalPages).toBe(1);
  });

  it("has one empty page when there are no items", () => {
    expect(paginate(0, 1, 12)).toEqual({ page: 1, totalPages: 1, offset: 0 });
  });
});
