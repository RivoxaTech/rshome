import { describe, expect, it } from "vitest";
import {
  parseKarachiDateString,
  KARACHI_OFFSET_MS,
  chooseBucket,
  computeChange,
  dayIndexFromKarachiDateString,
  karachiDayIndex,
  karachiMidnightUtc,
  resolveRange,
} from "./ranges";

describe("karachiDayIndex / karachiMidnightUtc", () => {
  it("round-trips: the midnight instant of a day index maps back to that day index", () => {
    for (const dayIndex of [0, 1, 20000, 20365]) {
      expect(karachiDayIndex(karachiMidnightUtc(dayIndex))).toBe(dayIndex);
    }
  });

  it("does not roll over at a UTC midnight that isn't a Karachi day boundary", () => {
    // Karachi is UTC+5, so 2026-03-15T00:00:00Z is 2026-03-15 05:00 in Karachi — the same Karachi
    // day as the instant five hours earlier, even though a UTC date boundary falls in between.
    const utcMidnight = new Date("2026-03-15T00:00:00.000Z");
    const justBefore = new Date(utcMidnight.getTime() - 1);
    expect(karachiDayIndex(utcMidnight)).toBe(karachiDayIndex(justBefore));
  });

  it("rolls over exactly at the Karachi midnight boundary (19:00 UTC, not a UTC midnight)", () => {
    const karachiMidnightInstant = new Date("2026-03-15T19:00:00.000Z"); // 2026-03-16 00:00 Karachi
    const oneMsBefore = new Date(karachiMidnightInstant.getTime() - 1);
    expect(karachiDayIndex(karachiMidnightInstant)).toBe(karachiDayIndex(oneMsBefore) + 1);
  });

  it("dayIndexFromKarachiDateString matches karachiDayIndex for the same calendar date", () => {
    const instant = new Date("2026-03-15T10:00:00.000Z");
    expect(dayIndexFromKarachiDateString("2026-03-15")).toBe(karachiDayIndex(instant));
  });
});

describe("resolveRange", () => {
  it("today: from is Karachi midnight of the current Karachi day, to is now", () => {
    const now = new Date("2026-03-15T10:00:00.000Z"); // 15:00 Karachi, same calendar day
    const range = resolveRange("today", now);
    expect(range.from).toEqual(karachiMidnightUtc(karachiDayIndex(now)));
    expect(range.to).toEqual(now);
    expect(range.spanDays).toBe(1);
  });

  it("today just before and after the Karachi midnight boundary falls on the correct day", () => {
    const justBeforeMidnight = new Date("2026-03-15T18:59:59.999Z"); // 23:59:59.999 Karachi, 15th
    const justAfterMidnight = new Date("2026-03-15T19:00:00.000Z"); // 00:00:00 Karachi, 16th
    expect(resolveRange("today", justBeforeMidnight).from).toEqual(karachiMidnightUtc(karachiDayIndex(justBeforeMidnight)));
    expect(resolveRange("today", justAfterMidnight).from).toEqual(karachiMidnightUtc(karachiDayIndex(justAfterMidnight)));
    expect(resolveRange("today", justAfterMidnight).from!.getTime()).toBeGreaterThan(resolveRange("today", justBeforeMidnight).from!.getTime());
  });

  it("today's previous period is the same elapsed portion of yesterday", () => {
    const now = new Date("2026-03-15T10:00:00.000Z");
    const range = resolveRange("today", now);
    const length = range.to.getTime() - range.from!.getTime();
    expect(range.previous).toEqual({ from: new Date(range.from!.getTime() - length), to: range.from });
  });

  it("7 days and 30 days span exactly 7 and 30 Karachi days, inclusive of today", () => {
    const now = new Date("2026-03-15T10:00:00.000Z");
    expect(resolveRange("7d", now).spanDays).toBe(7);
    expect(resolveRange("30d", now).spanDays).toBe(30);
    const sevenDay = resolveRange("7d", now);
    expect(karachiDayIndex(sevenDay.from!)).toBe(karachiDayIndex(now) - 6);
  });

  it("this_month on the 1st is a one-day span starting at today's Karachi midnight", () => {
    const now = new Date("2026-03-01T10:00:00.000Z"); // 15:00 Karachi, March 1st
    const range = resolveRange("this_month", now);
    expect(range.spanDays).toBe(1);
    expect(range.from).toEqual(karachiMidnightUtc(karachiDayIndex(now)));
  });

  it("this_month rolls over correctly across a Karachi month boundary", () => {
    // 2026-03-31 20:00 UTC is 2026-04-01 01:00 Karachi: already the next month in Karachi.
    const now = new Date("2026-03-31T20:00:00.000Z");
    const range = resolveRange("this_month", now);
    expect(range.spanDays).toBe(1);
    expect(karachiDayIndex(range.from!)).toBe(karachiDayIndex(now));
  });

  it("this_month mid-month spans from the 1st through today", () => {
    const now = new Date("2026-03-15T10:00:00.000Z");
    const range = resolveRange("this_month", now);
    expect(range.spanDays).toBe(15);
  });

  it("all time has no lower bound and no previous period", () => {
    const now = new Date("2026-03-15T10:00:00.000Z");
    const range = resolveRange("all", now);
    expect(range.from).toBeNull();
    expect(range.to).toEqual(now);
    expect(range.previous).toBeNull();
    expect(range.spanDays).toBeNull();
  });
});

describe("chooseBucket", () => {
  it("is daily up to and including 31 days", () => {
    expect(chooseBucket(1)).toBe("day");
    expect(chooseBucket(31)).toBe("day");
  });

  it("is weekly beyond 31 days and up to a year", () => {
    expect(chooseBucket(32)).toBe("week");
    expect(chooseBucket(365)).toBe("week");
  });

  it("is monthly beyond a year", () => {
    expect(chooseBucket(366)).toBe("month");
  });
});

describe("computeChange", () => {
  it("up: current higher than a positive previous", () => {
    expect(computeChange(150, 100)).toEqual({ kind: "up", percent: 50 });
  });

  it("down: current lower than a positive previous", () => {
    expect(computeChange(50, 100)).toEqual({ kind: "down", percent: -50 });
  });

  it("equal: current the same as a positive previous", () => {
    expect(computeChange(100, 100)).toEqual({ kind: "equal", percent: 0 });
  });

  it("zero: both periods empty", () => {
    expect(computeChange(0, 0)).toEqual({ kind: "zero", percent: null });
  });

  it("new: previous empty, current positive (not infinity)", () => {
    expect(computeChange(5, 0)).toEqual({ kind: "new", percent: null });
  });

  it("none: no comparison period at all (All time)", () => {
    expect(computeChange(10, null)).toEqual({ kind: "none", percent: null });
  });
});

// Exercises KARACHI_OFFSET_MS stays the documented fixed +05:00.
describe("KARACHI_OFFSET_MS", () => {
  it("is exactly five hours", () => {
    expect(KARACHI_OFFSET_MS).toBe(5 * 60 * 60 * 1000);
  });
});

describe("parseKarachiDateString (S22 BUG-16)", () => {
  it("accepts a real calendar date and refuses impossible or malformed ones", () => {
    expect(parseKarachiDateString("2026-10-04")).toBe(dayIndexFromKarachiDateString("2026-10-04"));
    for (const bad of ["2026-13-45", "2026-02-30", "2026-04-31", "26-10-04", "2026/10/04", "", null, undefined]) {
      expect(parseKarachiDateString(bad), String(bad)).toBeNull();
    }
  });
});
