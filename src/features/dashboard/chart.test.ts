import { describe, expect, it } from "vitest";
import { bucketSeries, buildSmoothAreaPath, buildSmoothPath, fillDailySeries, scaleLinear, type DailyPoint } from "./chart";
import { dayIndexFromKarachiDateString } from "./ranges";

const day = (dateStr: string) => dayIndexFromKarachiDateString(dateStr);

describe("fillDailySeries", () => {
  it("zero-fills a day with no row, instead of leaving a gap", () => {
    const from = day("2026-03-01");
    const to = day("2026-03-03");
    const rows: DailyPoint[] = [{ dayIndex: day("2026-03-01"), revenuePaisa: 10_000, orderCount: 2 }];
    const filled = fillDailySeries(rows, from, to);
    expect(filled).toEqual([
      { dayIndex: day("2026-03-01"), revenuePaisa: 10_000, orderCount: 2 },
      { dayIndex: day("2026-03-02"), revenuePaisa: 0, orderCount: 0 },
      { dayIndex: day("2026-03-03"), revenuePaisa: 0, orderCount: 0 },
    ]);
  });

  it("returns one point for a one-day range", () => {
    const from = day("2026-03-01");
    expect(fillDailySeries([], from, from)).toEqual([{ dayIndex: from, revenuePaisa: 0, orderCount: 0 }]);
  });
});

describe("bucketSeries", () => {
  const daily: DailyPoint[] = Array.from({ length: 10 }, (_, index) => ({
    dayIndex: day("2026-01-01") + index,
    revenuePaisa: 1000,
    orderCount: 1,
  }));

  it("is empty for an empty series", () => {
    expect(bucketSeries([], "day")).toEqual([]);
  });

  it("day bucketing returns one point per day, unchanged", () => {
    const result = bucketSeries(daily, "day");
    expect(result).toHaveLength(10);
    expect(result[0].revenuePaisa).toBe(1000);
    expect(result[0].orderCount).toBe(1);
  });

  it("week bucketing groups fixed 7-day bins, summing each", () => {
    const result = bucketSeries(daily, "week");
    expect(result).toHaveLength(2); // 7 + 3 days
    expect(result[0].revenuePaisa).toBe(7000);
    expect(result[0].orderCount).toBe(7);
    expect(result[1].revenuePaisa).toBe(3000);
    expect(result[1].orderCount).toBe(3);
  });

  it("month bucketing groups by calendar Karachi month", () => {
    // Spans late January into February.
    const spanning: DailyPoint[] = [
      { dayIndex: day("2026-01-30"), revenuePaisa: 100, orderCount: 1 },
      { dayIndex: day("2026-01-31"), revenuePaisa: 100, orderCount: 1 },
      { dayIndex: day("2026-02-01"), revenuePaisa: 200, orderCount: 1 },
      { dayIndex: day("2026-02-02"), revenuePaisa: 200, orderCount: 1 },
    ];
    const result = bucketSeries(spanning, "month");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ revenuePaisa: 200, orderCount: 2 });
    expect(result[1]).toMatchObject({ revenuePaisa: 400, orderCount: 2 });
  });
});

describe("scaleLinear", () => {
  it("maps the domain's endpoints to the range's endpoints", () => {
    const scale = scaleLinear([0, 100], [10, 210]);
    expect(scale(0)).toBe(10);
    expect(scale(100)).toBe(210);
    expect(scale(50)).toBe(110);
  });

  it("maps every value to the range start when the domain is flat (avoids dividing by zero)", () => {
    const scale = scaleLinear([5, 5], [0, 100]);
    expect(scale(5)).toBe(0);
  });
});

describe("buildSmoothPath", () => {
  it("is empty for no points", () => {
    expect(buildSmoothPath([])).toBe("");
  });

  it("is a bare moveto for one point", () => {
    expect(buildSmoothPath([{ x: 3, y: 4 }])).toBe("M3.00 4.00");
  });

  it("starts at the first point and ends at the last, with a cubic curve between every pair", () => {
    const points = [
      { x: 0, y: 10 },
      { x: 5, y: 20 },
      { x: 10, y: 0 },
      { x: 15, y: 5 },
    ];
    const path = buildSmoothPath(points);
    expect(path.startsWith("M0.00 10.00")).toBe(true);
    expect(path.endsWith("15.00 5.00")).toBe(true);
    expect(path.match(/C/g)).toHaveLength(points.length - 1);
  });
});

describe("buildSmoothAreaPath", () => {
  it("is empty for no points", () => {
    expect(buildSmoothAreaPath([], 100)).toBe("");
  });

  it("closes the smoothed line down to the baseline and back to the start, as a closed shape", () => {
    const points = [
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    ];
    const path = buildSmoothAreaPath(points, 50);
    expect(path.startsWith("M0.00 10.00")).toBe(true);
    expect(path).toContain("L10.00 50.00 L0.00 50.00 Z");
  });
});
