import { describe, expect, it } from "vitest";
import { resolveZone, type ZoneAreaRow, type ZoneRow } from "./zones";

const zones: ZoneRow[] = [
  { id: 1, name: "Karachi", mode: "quote", flatRate: "0.00", freeOverAmount: null, codEnabled: true, isFallback: false, isActive: true },
  { id: 2, name: "Pakistan", mode: "quote", flatRate: "0.00", freeOverAmount: null, codEnabled: true, isFallback: false, isActive: true },
  { id: 3, name: "International", mode: "quote", flatRate: "0.00", freeOverAmount: null, codEnabled: false, isFallback: true, isActive: true },
];

const areas: ZoneAreaRow[] = [
  { zoneId: 1, countryCode: "PK", city: "karachi" },
  { zoneId: 2, countryCode: "PK", city: null },
];

describe("resolveZone", () => {
  it("matches the city row first, ignoring case and spaces", () => {
    expect(resolveZone(zones, areas, "pk", " KARACHI ")?.name).toBe("Karachi");
  });

  it("falls back to the whole-country row for another city", () => {
    expect(resolveZone(zones, areas, "PK", "Lahore")?.name).toBe("Pakistan");
  });

  it("uses the fallback zone for a country with no area", () => {
    const zone = resolveZone(zones, areas, "GB", "London");
    expect(zone?.name).toBe("International");
    expect(zone?.pricing).toEqual({ mode: "quote", flatRate: 0, freeOverAmount: null, codEnabled: false });
  });

  it("skips inactive zones and returns null without a fallback", () => {
    const inactiveKarachi = zones.map((zone) => (zone.id === 1 ? { ...zone, isActive: false } : zone));
    expect(resolveZone(inactiveKarachi, areas, "PK", "Karachi")?.name).toBe("Pakistan");
    expect(resolveZone(zones.slice(0, 2), areas, "GB", "London")).toBeNull();
  });

  it("converts a flat zone's amounts to paisa", () => {
    const flat: ZoneRow = { ...zones[0], mode: "flat", flatRate: "300.00", freeOverAmount: "5000.00" };
    expect(resolveZone([flat], areas, "PK", "Karachi")?.pricing).toEqual({
      mode: "flat",
      flatRate: 30000,
      freeOverAmount: 500000,
      codEnabled: true,
    });
  });
});
