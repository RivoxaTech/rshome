import type { ShopSort } from "@/features/catalog/listing";

export type ListingState = { category?: string; q?: string; sort: ShopSort; page: number };

/** A listing URL with default values left out, e.g. /shop?category=trays&sort=price_asc. */
export function listingHref(basePath: string, state: ListingState): string {
  const search = new URLSearchParams();
  if (state.category) search.set("category", state.category);
  if (state.q) search.set("q", state.q);
  if (state.sort !== "recommended") search.set("sort", state.sort);
  if (state.page > 1) search.set("page", String(state.page));
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}
