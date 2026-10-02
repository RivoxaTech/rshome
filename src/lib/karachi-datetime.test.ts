import { describe, expect, it } from "vitest";
import { formatKarachiDateTime, karachiLocalToUtc, utcToKarachiLocal } from "./karachi-datetime";

describe("karachiLocalToUtc", () => {
  it("reads a datetime-local value as Karachi time (+05:00)", () => {
    expect(karachiLocalToUtc("2026-10-03T14:30")?.toISOString()).toBe("2026-10-03T09:30:00.000Z");
  });

  it("crosses midnight correctly: 02:00 in Karachi is 21:00 the previous UTC day", () => {
    expect(karachiLocalToUtc("2026-10-03T02:00")?.toISOString()).toBe("2026-10-02T21:00:00.000Z");
  });

  it("refuses a malformed or impossible value", () => {
    expect(karachiLocalToUtc("")).toBeNull();
    expect(karachiLocalToUtc("2026-10-03")).toBeNull();
    expect(karachiLocalToUtc("2026-02-31T10:00")).toBeNull();
    expect(karachiLocalToUtc("2026-10-03T25:00")).toBeNull();
    expect(karachiLocalToUtc("yesterday")).toBeNull();
  });
});

describe("utcToKarachiLocal", () => {
  it("round-trips with karachiLocalToUtc", () => {
    const local = "2026-12-31T23:45";
    expect(utcToKarachiLocal(karachiLocalToUtc(local)!)).toBe(local);
  });

  it("zero-pads every component", () => {
    expect(utcToKarachiLocal(new Date("2026-01-05T00:05:00.000Z"))).toBe("2026-01-05T05:05");
  });
});

describe("formatKarachiDateTime", () => {
  it("formats in Karachi time with a short month", () => {
    expect(formatKarachiDateTime(new Date("2026-10-03T09:30:00.000Z"))).toBe("3 Oct 2026, 14:30");
  });
});
