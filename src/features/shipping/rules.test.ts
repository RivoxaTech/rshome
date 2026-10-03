import { describe, expect, it } from "vitest";
import { COUNTRY_CODES } from "@/config/countries";
import { areaLabel, checkoutDestinations, countFallbacks, coverageGaps, describeDestination, findAreaConflicts, newCoverageGaps } from "./rules";
import { resolveZone, type ZoneAreaRow, type ZoneRow } from "./zones";

const zone = (overrides: Partial<ZoneRow> & { id: number }): ZoneRow => ({
  name: `Zone ${overrides.id}`,
  mode: "quote",
  flatRate: "0.00",
  freeOverAmount: null,
  codEnabled: false,
  isFallback: false,
  isActive: true,
  ...overrides,
});

/** The seeded first-release setup: Karachi, Pakistan, International (fallback). */
const seeded: ZoneRow[] = [zone({ id: 1, name: "Karachi", codEnabled: true }), zone({ id: 2, name: "Pakistan", codEnabled: true }), zone({ id: 3, name: "International", isFallback: true })];
const seededAreas: ZoneAreaRow[] = [
  { zoneId: 1, countryCode: "PK", city: "karachi" },
  { zoneId: 2, countryCode: "PK", city: null },
];

const names = (code: string) => ({ PK: "Pakistan", GB: "United Kingdom" })[code] ?? code;

describe("checkoutDestinations / coverageGaps", () => {
  it("tests every checkout country plus Karachi for Pakistan", () => {
    const destinations = checkoutDestinations();
    expect(destinations).toHaveLength(COUNTRY_CODES.size + 1);
    expect(destinations[0]).toEqual({ country: "PK", city: "karachi" });
  });

  it("finds no gap with the seeded zones, and every country but Pakistan once the fallback is inactive", () => {
    expect(coverageGaps(seeded, seededAreas)).toEqual([]);
    const gaps = coverageGaps(
      seeded.map((row) => (row.id === 3 ? { ...row, isActive: false } : row)),
      seededAreas,
    );
    expect(gaps).toHaveLength(COUNTRY_CODES.size - 1);
    expect(gaps.some((gap) => gap.country === "PK")).toBe(false);
    expect(gaps.some((gap) => gap.country === "GB")).toBe(true);
  });

  it("reports every destination when no zone is active", () => {
    expect(coverageGaps(seeded.map((row) => ({ ...row, isActive: false })), seededAreas)).toHaveLength(COUNTRY_CODES.size + 1);
  });

  it("deactivating Karachi alone leaves no gap (Pakistan then covers it), matching the real resolver", () => {
    const zones = seeded.map((row) => (row.id === 1 ? { ...row, isActive: false } : row));
    expect(coverageGaps(zones, seededAreas)).toEqual([]);
    expect(resolveZone(zones, seededAreas, "PK", "Karachi")?.id).toBe(2);
  });
});

describe("newCoverageGaps", () => {
  it("counts only the destinations a change newly strands, never gaps that already existed", () => {
    // No fallback at all: abroad is already uncovered, so deactivating Karachi (Pakistan still covers it) introduces nothing new…
    const noFallback = seeded.filter((row) => !row.isFallback);
    const karachiOff = noFallback.map((row) => (row.id === 1 ? { ...row, isActive: false } : row));
    expect(newCoverageGaps({ zones: noFallback, areas: seededAreas }, { zones: karachiOff, areas: seededAreas })).toEqual([]);
    // …while deactivating Pakistan newly strands every other Pakistani city (Karachi keeps its own zone).
    const pakistanOff = noFallback.map((row) => (row.id === 2 ? { ...row, isActive: false } : row));
    expect(newCoverageGaps({ zones: noFallback, areas: seededAreas }, { zones: pakistanOff, areas: seededAreas })).toEqual([{ country: "PK", city: "" }]);
  });
});

describe("findAreaConflicts", () => {
  it("flags an area another zone owns and ignores the zone's own areas", () => {
    expect(findAreaConflicts(seededAreas, 3, [{ countryCode: "PK", city: "karachi" }])).toEqual([{ area: { countryCode: "PK", city: "karachi" }, zoneId: 1 }]);
    expect(findAreaConflicts(seededAreas, 1, [{ countryCode: "PK", city: "karachi" }])).toEqual([]);
    expect(findAreaConflicts(seededAreas, null, [{ countryCode: "PK", city: null }])).toEqual([{ area: { countryCode: "PK", city: null }, zoneId: 2 }]);
  });

  it("treats the whole country and a city in it as different areas", () => {
    expect(findAreaConflicts(seededAreas, 3, [{ countryCode: "PK", city: "lahore" }, { countryCode: "GB", city: null }])).toEqual([]);
  });
});

describe("countFallbacks", () => {
  it("counts the fallback zones", () => {
    expect(countFallbacks(seeded)).toBe(1);
    expect(countFallbacks(seeded.filter((row) => !row.isFallback))).toBe(0);
  });
});

describe("describeDestination", () => {
  const flags = { coupons: true, cod: true };

  it("reports a quote zone and COD per the real rule (Pakistan-only, zone switch, flag)", () => {
    const karachi = resolveZone(seeded, seededAreas, "PK", "Karachi");
    expect(describeDestination(karachi, "PK", 0, flags)).toEqual({ zone: { id: 1, name: "Karachi" }, delivery: { kind: "quote" }, codAvailable: true });
    const abroad = resolveZone(seeded, seededAreas, "GB", "");
    expect(describeDestination(abroad, "GB", 0, flags)).toEqual({ zone: { id: 3, name: "International" }, delivery: { kind: "quote" }, codAvailable: false });
    // COD switched on for the fallback zone still never reaches an address outside Pakistan.
    const permissive = seeded.map((row) => (row.id === 3 ? { ...row, codEnabled: true } : row));
    expect(describeDestination(resolveZone(permissive, seededAreas, "GB", ""), "GB", 0, flags).codAvailable).toBe(false);
    expect(describeDestination(karachi, "PK", 0, { coupons: true, cod: false }).codAvailable).toBe(false);
  });

  it("reports a flat charge, free delivery over the threshold, and no zone at all", () => {
    const flat = seeded.map((row) => (row.id === 1 ? { ...row, mode: "flat" as const, flatRate: "250.00", freeOverAmount: "5000.00" } : row));
    const karachi = resolveZone(flat, seededAreas, "PK", "karachi");
    expect(describeDestination(karachi, "PK", 100_000, flags).delivery).toEqual({ kind: "flat", amount: 25_000 });
    expect(describeDestination(karachi, "PK", 500_000, flags).delivery).toEqual({ kind: "free" });
    expect(describeDestination(null, "GB", 0, flags)).toEqual({ zone: null, delivery: null, codAvailable: false });
  });
});

describe("areaLabel", () => {
  it("names a country, and title-cases a city before its country", () => {
    expect(areaLabel({ countryCode: "GB", city: null }, names)).toBe("United Kingdom");
    expect(areaLabel({ countryCode: "PK", city: "dera ghazi khan" }, names)).toBe("Dera Ghazi Khan, Pakistan");
  });
});
