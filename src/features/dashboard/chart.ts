/**
 * The revenue chart's data shaping and SVG geometry (BUILD_PLAN.md C28, ARCHITECTURE.md §4.7).
 * Pure: no DB or I/O, unit-tested directly. `dashboard/repo.ts` queries one row per Karachi day
 * that had at least one order; everything else (zero-filling empty days, bucketing into weeks or
 * months, building the SVG path) happens here so it can be tested without a database.
 */
import { DAY_MS, type Bucket } from "./ranges";

export type DailyPoint = { dayIndex: number; revenuePaisa: number; orderCount: number };

/** Every day in `[fromDayIndex, toDayIndex]`, in order; a day with no row becomes a zero point. */
export function fillDailySeries(rows: DailyPoint[], fromDayIndex: number, toDayIndex: number): DailyPoint[] {
  const byDay = new Map(rows.map((row) => [row.dayIndex, row]));
  const points: DailyPoint[] = [];
  for (let day = fromDayIndex; day <= toDayIndex; day += 1) {
    const row = byDay.get(day);
    points.push({ dayIndex: day, revenuePaisa: row?.revenuePaisa ?? 0, orderCount: row?.orderCount ?? 0 });
  }
  return points;
}

export type ChartPoint = { label: string; dateKarachi: string; revenuePaisa: number; orderCount: number };

/**
 * `dayIndex * DAY_MS` is the "pretend UTC" instant standing for that Karachi calendar date (the
 * same trick `ranges.ts` uses), so formatting it with `timeZone: "UTC"` — not Asia/Karachi, which
 * would shift it again — reads back the right calendar date.
 */
function karachiDateString(dayIndex: number): string {
  return new Date(dayIndex * DAY_MS).toISOString().slice(0, 10);
}

const dayLabelFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const monthLabelFormatter = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

function sumPoints(points: DailyPoint[]): { revenuePaisa: number; orderCount: number } {
  return points.reduce(
    (total, point) => ({ revenuePaisa: total.revenuePaisa + point.revenuePaisa, orderCount: total.orderCount + point.orderCount }),
    { revenuePaisa: 0, orderCount: 0 },
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
}

/** Fixed 7-Karachi-day bins from the start of the series — only ever exercised by "All time", so calendar Mon–Sun alignment isn't worth the extra complexity. */
function bucketWeekly(daily: DailyPoint[]): ChartPoint[] {
  return chunk(daily, 7).map((group) => ({
    label: dayLabelFormatter.format(new Date(group[0].dayIndex * DAY_MS)),
    dateKarachi: karachiDateString(group[0].dayIndex),
    ...sumPoints(group),
  }));
}

/** Calendar Karachi months, grouped in the input's chronological order. */
function bucketMonthly(daily: DailyPoint[]): ChartPoint[] {
  const groups = new Map<string, DailyPoint[]>();
  for (const point of daily) {
    const date = new Date(point.dayIndex * DAY_MS);
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    const list = groups.get(key);
    if (list) list.push(point);
    else groups.set(key, [point]);
  }
  return [...groups.values()].map((group) => ({
    label: monthLabelFormatter.format(new Date(group[0].dayIndex * DAY_MS)),
    dateKarachi: karachiDateString(group[0].dayIndex),
    ...sumPoints(group),
  }));
}

export function bucketSeries(daily: DailyPoint[], bucket: Bucket): ChartPoint[] {
  if (daily.length === 0) return [];
  if (bucket === "day") {
    return daily.map((point) => ({
      label: dayLabelFormatter.format(new Date(point.dayIndex * DAY_MS)),
      dateKarachi: karachiDateString(point.dayIndex),
      revenuePaisa: point.revenuePaisa,
      orderCount: point.orderCount,
    }));
  }
  return bucket === "week" ? bucketWeekly(daily) : bucketMonthly(daily);
}

// ── SVG geometry ────────────────────────────────────────────────────────────────────────────

export type Point = { x: number; y: number };

/** Maps a domain value to a pixel range; a flat domain (every value equal) maps to the range's start. */
export function scaleLinear(domain: [number, number], range: [number, number]): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  if (span === 0) return () => r0;
  return (value: number) => r0 + ((value - d0) / span) * (r1 - r0);
}

/** A plain polyline path: `"M x y L x y L x y"`. Empty input returns `""`. */
export function buildLinePath(points: Point[]): string {
  if (points.length === 0) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

/**
 * A smoothed curve through every point (a Catmull-Rom spline converted to cubic Beziers, tension
 * 1/6 — the standard conversion). Unlike `buildLinePath` this still passes through each point
 * exactly; only the curve between them is smoothed, matching the owner's reference dashboard.
 */
export function buildSmoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  const at = (index: number): Point => points[Math.max(0, Math.min(points.length - 1, index))];
  let path = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return path;
}

/** `buildSmoothPath`'s curve, closed down to `baselineY` — a filled area under the line. */
export function buildSmoothAreaPath(points: Point[], baselineY: number): string {
  if (points.length === 0) return "";
  const line = buildSmoothPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L${last.x.toFixed(2)} ${baselineY.toFixed(2)} L${first.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
}
