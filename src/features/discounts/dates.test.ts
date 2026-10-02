import { describe, expect, it } from "vitest";
import { isDiscountActive } from "@/features/pricing/pricing";
import { karachiLocalToUtc } from "@/lib/karachi-datetime";
import { checkDateWindow, dateInputMin, dateWindowFieldErrors, END_IN_PAST_MESSAGE, START_IN_PAST_MESSAGE, START_TOLERANCE_MS } from "./dates";

describe("dateInputMin", () => {
  const nowLocal = "2026-10-03T15:00";

  it("is the current Karachi time for a blank or future stored value", () => {
    expect(dateInputMin("", nowLocal)).toBe(nowLocal);
    expect(dateInputMin("2026-10-04T09:00", nowLocal)).toBe(nowLocal);
    expect(dateInputMin(nowLocal, nowLocal)).toBe(nowLocal);
  });

  it("is absent for an unchanged past value, so the browser never blocks saving other fields", () => {
    expect(dateInputMin("2026-10-01T09:00", nowLocal)).toBeUndefined();
  });
});

const now = new Date("2026-10-03T10:00:00.000Z");
const minute = 60 * 1000;
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);

describe("checkDateWindow on create", () => {
  it("allows blank bounds, a future start and a future end", () => {
    expect(checkDateWindow({ startsAt: null, endsAt: null }, { previous: null, now })).toEqual([]);
    expect(checkDateWindow({ startsAt: at(60 * minute), endsAt: at(120 * minute) }, { previous: null, now })).toEqual([]);
  });

  it("refuses a start in the past, but accepts one within the 5-minute tolerance", () => {
    expect(checkDateWindow({ startsAt: at(-10 * minute), endsAt: null }, { previous: null, now })).toEqual([{ field: "startsAt", message: START_IN_PAST_MESSAGE }]);
    expect(checkDateWindow({ startsAt: at(-START_TOLERANCE_MS), endsAt: null }, { previous: null, now })).toEqual([]);
    expect(checkDateWindow({ startsAt: at(-START_TOLERANCE_MS - 1), endsAt: null }, { previous: null, now })).toHaveLength(1);
    expect(checkDateWindow({ startsAt: now, endsAt: null }, { previous: null, now })).toEqual([]);
  });

  it("refuses an end in the past or exactly now (the end is exclusive), with no tolerance", () => {
    expect(checkDateWindow({ startsAt: null, endsAt: at(-minute) }, { previous: null, now })).toEqual([{ field: "endsAt", message: END_IN_PAST_MESSAGE }]);
    expect(checkDateWindow({ startsAt: null, endsAt: now }, { previous: null, now })).toHaveLength(1);
    expect(checkDateWindow({ startsAt: null, endsAt: at(minute) }, { previous: null, now })).toEqual([]);
  });

  it("reports both fields when both are in the past", () => {
    const errors = checkDateWindow({ startsAt: at(-60 * minute), endsAt: at(-30 * minute) }, { previous: null, now });
    expect(dateWindowFieldErrors(errors)).toEqual({ startsAt: START_IN_PAST_MESSAGE, endsAt: END_IN_PAST_MESSAGE });
  });

  it("skips the rule entirely with allowPastDates (seeds and fixtures)", () => {
    expect(checkDateWindow({ startsAt: at(-60 * minute), endsAt: at(-30 * minute) }, { previous: null, now, allowPastDates: true })).toEqual([]);
  });
});

describe("checkDateWindow on edit", () => {
  const previous = { startsAt: at(-48 * 60 * minute), endsAt: at(-24 * 60 * minute) }; // a discount that already ran

  it("accepts an unchanged past start and an unchanged past end, so other fields can still be saved", () => {
    expect(checkDateWindow({ startsAt: new Date(previous.startsAt), endsAt: new Date(previous.endsAt) }, { previous, now })).toEqual([]);
  });

  it("refuses a start changed into the past", () => {
    expect(checkDateWindow({ startsAt: at(-10 * minute), endsAt: new Date(previous.endsAt) }, { previous, now })).toEqual([{ field: "startsAt", message: START_IN_PAST_MESSAGE }]);
  });

  it("refuses an end changed into the past, and accepts one moved into the future", () => {
    expect(checkDateWindow({ startsAt: new Date(previous.startsAt), endsAt: at(-minute) }, { previous, now })).toEqual([{ field: "endsAt", message: END_IN_PAST_MESSAGE }]);
    expect(checkDateWindow({ startsAt: new Date(previous.startsAt), endsAt: at(60 * minute) }, { previous, now })).toEqual([]);
  });

  it("clearing a past bound, or setting a bound that was blank, counts as a change", () => {
    expect(checkDateWindow({ startsAt: null, endsAt: null }, { previous, now })).toEqual([]); // cleared: nothing to check
    expect(checkDateWindow({ startsAt: at(-10 * minute), endsAt: null }, { previous: { startsAt: null, endsAt: null }, now })).toHaveLength(1);
  });
});

describe("a Karachi start becomes active at that exact Karachi instant", () => {
  const discount = (startsAt: Date) => ({ id: 1, type: "percent" as const, value: 1000, targetType: "all" as const, targetIds: [], isActive: true, startsAt, endsAt: null });

  it("14:30 Karachi is 09:30 UTC: inactive one minute before, active from the minute itself", () => {
    const startsAt = karachiLocalToUtc("2026-10-03T14:30")!;
    expect(startsAt.toISOString()).toBe("2026-10-03T09:30:00.000Z");
    expect(isDiscountActive(discount(startsAt), new Date("2026-10-03T09:29:59.000Z"))).toBe(false);
    expect(isDiscountActive(discount(startsAt), new Date("2026-10-03T09:30:00.000Z"))).toBe(true);
    // Not five hours off in either direction.
    expect(isDiscountActive(discount(startsAt), new Date("2026-10-03T04:30:00.000Z"))).toBe(false);
  });
});
