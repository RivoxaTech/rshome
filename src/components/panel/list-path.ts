/**
 * Builds a panel list page's URL from plain, serialisable pieces (a base path, an already-resolved
 * tab slug, search, page, page size) — shared by the orders and wholesale lists' `SearchBox`,
 * `Pagination` and `RowsPerPageSelect`. Deliberately NOT a function prop: those three are Client
 * Components, and a Server Component parent (`OrdersPageBody`/`WholesalePageBody`) can't hand a
 * function across that boundary (only serialisable values or Server Actions cross it) — passing
 * one throws "Functions cannot be passed directly to Client Components" at render time, a failure
 * that only shows up once the route actually renders, not in `tsc`/`next build`. Each feature's own
 * `ordersPath`/`wholesalePath` still does the real path-building for links that stay in Server
 * Components (tabs, detail back-links, redirects); this is the client-safe equivalent for the three
 * components that run in the browser.
 */
export function buildListPath(
  basePath: string,
  tabSlug: string | undefined,
  { q, page, pageSize, category, extra }: { q?: string; page?: number; pageSize?: number; category?: string; extra?: Record<string, string | undefined> },
  defaultPageSize: number,
): string {
  const params = new URLSearchParams();
  if (tabSlug) params.set("tab", tabSlug);
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  // A list with its own filters (the audit viewer, S20) carries them as plain string pairs; blank ones are dropped.
  for (const [key, value] of Object.entries(extra ?? {})) if (value) params.set(key, value);
  if (page && page > 1) params.set("page", String(page));
  if (pageSize && pageSize !== defaultPageSize) params.set("pageSize", String(pageSize));
  const search = params.toString();
  return `${basePath}${search ? `?${search}` : ""}`;
}
