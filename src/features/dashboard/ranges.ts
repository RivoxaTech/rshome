/**
 * Period maths for the admin dashboard (BUILD_PLAN.md C28, ARCHITECTURE.md §4.7). Pure: no DB or
 * I/O, unit-tested directly. Day boundaries are Asia/Karachi, computed with a fixed +05:00 offset
 * — Pakistan has no daylight saving, so a fixed offset is exact, and it avoids needing MySQL/
 * MariaDB timezone tables (which the host's MariaDB may not have loaded).
 */

export const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** The Karachi calendar day an instant falls on, as an integer day count since the epoch. */
export function karachiDayIndex(instant: Date): number {
  return Math.floor((instant.getTime() + KARACHI_OFFSET_MS) / DAY_MS);
}

/** The UTC instant of Karachi midnight for a given day index. */
export function karachiMidnightUtc(dayIndex: number): Date {
  return new Date(dayIndex * DAY_MS - KARACHI_OFFSET_MS);
}

/** The day index for a "YYYY-MM-DD" Karachi-local date string, e.g. a `DATE(created_at + INTERVAL 5 HOUR)` SQL value. */
export function dayIndexFromKarachiDateString(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

export const RANGE_KEYS = ["today", "7d", "30d", "this_month", "all"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];
export const DEFAULT_RANGE: RangeKey = "30d";

export const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  this_month: "This month",
  all: "All time",
};

/** The dashboard's own URL, carrying the period like the orders/wholesale lists carry their tab. */
export function dashboardPath(range: RangeKey): string {
  return range === DEFAULT_RANGE ? "/panel" : `/panel?range=${range}`;
}

export type ResolvedRange = {
  key: RangeKey;
  from: Date | null;
  to: Date;
  /** The previous period of the same length, for the stat cards' change badges. Null for "all". */
  previous: { from: Date; to: Date } | null;
  /** Inclusive day count of the period; null for "all" (resolved separately once the earliest order date is known — see dashboard/service.ts). */
  spanDays: number | null;
};

/** Karachi day index of the 1st of the Karachi-local month `now` falls in. */
function karachiFirstOfMonthDayIndex(now: Date): number {
  const local = new Date(now.getTime() + KARACHI_OFFSET_MS);
  const firstOfMonthPretendUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1);
  return firstOfMonthPretendUtc / DAY_MS;
}

/**
 * Resolves a range key to a `[from, to)` instant pair on Karachi day boundaries, plus the previous
 * period of the same length (`previous = [from - length, from)`) — applied uniformly, so "Today"
 * naturally compares against yesterday's same elapsed portion of the day, not all of yesterday.
 */
export function resolveRange(key: RangeKey, now: Date): ResolvedRange {
  const todayIndex = karachiDayIndex(now);

  if (key === "all") {
    return { key, from: null, to: now, previous: null, spanDays: null };
  }

  let fromDayIndex: number;
  switch (key) {
    case "today":
      fromDayIndex = todayIndex;
      break;
    case "7d":
      fromDayIndex = todayIndex - 6;
      break;
    case "30d":
      fromDayIndex = todayIndex - 29;
      break;
    case "this_month":
      fromDayIndex = karachiFirstOfMonthDayIndex(now);
      break;
  }

  const from = karachiMidnightUtc(fromDayIndex);
  const to = now;
  const length = to.getTime() - from.getTime();
  const previous = { from: new Date(from.getTime() - length), to: new Date(from.getTime()) };
  const spanDays = todayIndex - fromDayIndex + 1;

  return { key, from, to, previous, spanDays };
}

export type Bucket = "day" | "week" | "month";

/**
 * Daily points up to 31 days, weekly beyond, monthly past a year (C28). Every range but "all" is
 * at most 31 days by construction, so this only ever chooses week/month for "all".
 */
export function chooseBucket(spanDays: number): Bucket {
  if (spanDays <= 31) return "day";
  if (spanDays <= 365) return "week";
  return "month";
}

export type ChangeKind = "up" | "down" | "equal" | "zero" | "new" | "none";
export type ChangeBadge = { kind: ChangeKind; percent: number | null };

/**
 * The stat cards' up/down badge. `previous === null` means no comparison period exists (All time).
 * `previous === 0` can't give a percentage (division by zero): "zero" when the current period is
 * also empty, "new" when it isn't (owner decision: show "new" instead of infinity).
 */
export function computeChange(current: number, previous: number | null): ChangeBadge {
  if (previous === null) return { kind: "none", percent: null };
  if (previous === 0) return current === 0 ? { kind: "zero", percent: null } : { kind: "new", percent: null };
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent > 0) return { kind: "up", percent };
  if (percent < 0) return { kind: "down", percent };
  return { kind: "equal", percent: 0 };
}
