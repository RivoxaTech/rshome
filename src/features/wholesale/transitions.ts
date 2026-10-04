/**
 * The wholesale inquiry's status on plain data (REQUIREMENTS SF-08/AD-05, S17): no DB or I/O.
 * Unlike the order status machine, nothing downstream (stock, payments) depends on this status,
 * so any status may move to any other one — there's no correctness reason to forbid reopening a
 * closed lead or jumping straight from New to Closed.
 */
import { PILL_COLORS } from "@/lib/pill-colors";
import { DEFAULT_PAGE_SIZE } from "@/features/shared/pagination";

export const WHOLESALE_STATUSES = ["new", "contacted", "closed"] as const;
export type WholesaleStatus = (typeof WHOLESALE_STATUSES)[number];

export const STATUS_LABELS: Record<WholesaleStatus, string> = {
  new: "New",
  contacted: "Contacted",
  closed: "Closed",
};

/** One colour per status, readable in light and dark: dot, pill background and pill text. */
export const STATUS_COLORS: Record<WholesaleStatus, { dot: string; bg: string; text: string }> = {
  new: PILL_COLORS.blue,
  contacted: PILL_COLORS.amber,
  closed: PILL_COLORS.gray,
};

export function canChangeStatus(from: WholesaleStatus, to: WholesaleStatus): boolean {
  return from !== to;
}

/**
 * The detail page's primary button (one step forward, S17 follow-up): New → Contacted,
 * Contacted → Closed, Closed → Contacted ("Reopen" — a closed lead that needs following up again
 * is reopened to Contacted, not back to New).
 */
export function primaryStatusTarget(current: WholesaleStatus): WholesaleStatus {
  switch (current) {
    case "new":
      return "contacted";
    case "contacted":
      return "closed";
    case "closed":
      return "contacted";
  }
}

const PRIMARY_STATUS_LABELS: Record<WholesaleStatus, string> = {
  new: "Mark contacted",
  contacted: "Close inquiry",
  closed: "Reopen",
};

export function primaryStatusLabel(current: WholesaleStatus): string {
  return PRIMARY_STATUS_LABELS[current];
}

/** The ⋮ menu's option(s): whichever status the primary button doesn't already offer. */
export function secondaryStatusTargets(current: WholesaleStatus): WholesaleStatus[] {
  const primary = primaryStatusTarget(current);
  return WHOLESALE_STATUSES.filter((status) => status !== current && status !== primary);
}

/** The ⋮ menu's own labels — plain "set to X" wording, since "Reopen" only makes sense as the primary action. */
export const STATUS_ACTION_LABELS: Record<WholesaleStatus, string> = {
  new: "Mark new",
  contacted: "Mark contacted",
  closed: "Close inquiry",
};

/** The inbox's page with its tab, search, page and page size in the URL: `/panel/wholesale?tab=contacted&q=ali`. */
export function wholesalePath(
  tab: WholesaleStatus | "all" = "all",
  { q, page, pageSize }: { q?: string; page?: number; pageSize?: number } = {},
): string {
  const params = new URLSearchParams();
  if (tab !== "all") params.set("tab", tab);
  if (q) params.set("q", q);
  if (page && page > 1) params.set("page", String(page));
  if (pageSize && pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(pageSize));
  const search = params.toString();
  return `/panel/wholesale${search ? `?${search}` : ""}`;
}
