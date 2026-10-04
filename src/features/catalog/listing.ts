/** Pure sort and pagination for the shop grid (no DB), so both are unit-tested. */
import type { Paisa } from "@/features/pricing/money";

export const SHOP_SORTS = ["recommended", "newest", "price_asc", "price_desc"] as const;
export type ShopSort = (typeof SHOP_SORTS)[number];
/** The staff-controlled order (S10); the one value the listing URL leaves out. */
export const DEFAULT_SORT: ShopSort = "recommended";

export type SortableProduct = {
  id: number;
  createdAt: Date;
  /** The price the card shows: the cheapest active variant's discounted unit price. */
  fromPrice: Paisa;
  /** Staff-controlled display order (S10, `products.sort_order`). */
  sortOrder: number;
};

function byNewest(a: SortableProduct, b: SortableProduct): number {
  return b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id;
}

/** Lower `sortOrder` first; ties (and products sharing a value) fall back to newest first. */
function byRecommended(a: SortableProduct, b: SortableProduct): number {
  return a.sortOrder - b.sortOrder || byNewest(a, b);
}

/** Equal prices fall back to newest first, so the order is stable across pages. */
export function sortProducts<T extends SortableProduct>(items: T[], sort: ShopSort): T[] {
  const compare =
    sort === "price_asc"
      ? (a: T, b: T) => a.fromPrice - b.fromPrice || byNewest(a, b)
      : sort === "price_desc"
        ? (a: T, b: T) => b.fromPrice - a.fromPrice || byNewest(a, b)
        : sort === "newest"
          ? byNewest
          : byRecommended;
  return [...items].sort(compare);
}

type Pagination = { page: number; totalPages: number; offset: number };

/** A page past the end shows the last page; there is always at least one (possibly empty) page. */
export function paginate(totalItems: number, requestedPage: number, pageSize: number): Pagination {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  return { page, totalPages, offset: (page - 1) * pageSize };
}
