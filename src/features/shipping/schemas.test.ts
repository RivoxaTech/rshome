import { describe, expect, it } from "vitest";
import { FLAT_RATE_REQUIRED, FREE_OVER_FLAT_ONLY, MAX_ZONE_AREAS, areaToken, normalizeCity, parseAreaToken, testDestinationSchema, zoneAreasField, zoneInputSchema } from "./schemas";

const valid = (overrides: Record<string, unknown> = {}) => ({
  name: " Karachi ",
  mode: "quote",
  flatRate: "",
  freeOverAmount: "",
  codEnabled: "true",
  isActive: "true",
  areas: "PK:karachi",
  version: "123",
  ...overrides,
});

describe("area tokens", () => {
  it("parses a whole country and a city, normalising case and spacing", () => {
    expect(parseAreaToken(" gb ")).toEqual({ countryCode: "GB", city: null });
    expect(parseAreaToken("pk:  Karachi ")).toEqual({ countryCode: "PK", city: "karachi" });
    expect(parseAreaToken("PK:Dera  Ghazi Khan")).toEqual({ countryCode: "PK", city: "dera ghazi khan" });
    expect(areaToken({ countryCode: "PK", city: "karachi" })).toBe("PK:karachi");
    expect(areaToken({ countryCode: "GB", city: null })).toBe("GB");
  });

  it("refuses an unknown country and an unusable city", () => {
    expect(parseAreaToken("XX")).toBeNull();
    expect(parseAreaToken("ZZ:karachi")).toBeNull();
    expect(parseAreaToken("PK:<b>")).toBeNull();
    expect(parseAreaToken("PK:a")).toBeNull();
  });

  it("normalizeCity lower-cases and collapses whitespace", () => {
    expect(normalizeCity("  Rawal  Pindi ")).toBe("rawal pindi");
  });
});

describe("zoneAreasField", () => {
  it("de-duplicates tokens that differ only in case or spacing", () => {
    expect(zoneAreasField.parse("PK:Karachi, pk:karachi ,GB,gb")).toEqual([
      { countryCode: "PK", city: "karachi" },
      { countryCode: "GB", city: null },
    ]);
    expect(zoneAreasField.parse("")).toEqual([]);
  });

  it("refuses a bad token by name and too many areas", () => {
    const refused = zoneAreasField.safeParse("GB,Atlantis");
    expect(refused.success).toBe(false);
    if (!refused.success) expect(refused.error.issues[0].message).toContain("Atlantis");
    const many = Array.from({ length: MAX_ZONE_AREAS + 1 }, (_, i) => `PK:city${i}`).join(",");
    expect(zoneAreasField.safeParse(many).success).toBe(false);
  });
});

describe("zoneInputSchema", () => {
  it("in quote mode pins the flat rate to 0.00 and drops a threshold, whatever was posted", () => {
    const parsed = zoneInputSchema.parse(valid({ flatRate: "250" }));
    expect(parsed).toMatchObject({ name: "Karachi", mode: "quote", flatRate: "0.00", freeOverAmount: null, codEnabled: true, isActive: true, isFallback: false, version: "123" });
    expect(parsed.areas).toEqual([{ countryCode: "PK", city: "karachi" }]);
  });

  it("in quote mode refuses a free-over threshold", () => {
    const refused = zoneInputSchema.safeParse(valid({ freeOverAmount: "5000" }));
    expect(refused.success).toBe(false);
    if (!refused.success) expect(refused.error.issues[0]).toMatchObject({ path: ["freeOverAmount"], message: FREE_OVER_FLAT_ONLY });
  });

  it("in flat mode requires a rate above 0 and normalises amounts to DECIMAL strings", () => {
    const parsed = zoneInputSchema.parse(valid({ mode: "flat", flatRate: "250", freeOverAmount: "5000.5" }));
    expect(parsed.flatRate).toBe("250.00");
    expect(parsed.freeOverAmount).toBe("5000.50");
    for (const bad of ["", "0", "0.00", "abc"]) {
      const refused = zoneInputSchema.safeParse(valid({ mode: "flat", flatRate: bad }));
      expect(refused.success, bad).toBe(false);
      if (!refused.success) expect(refused.error.issues[0].path).toEqual(["flatRate"]);
    }
    const flat = zoneInputSchema.safeParse(valid({ mode: "flat", flatRate: "0" }));
    if (!flat.success) expect(flat.error.issues[0].message).toBe(FLAT_RATE_REQUIRED);
  });

  it("reads the switches as 'true'/'false' strings and refuses an unknown mode or blank name", () => {
    expect(zoneInputSchema.parse(valid({ codEnabled: "false", isActive: "false", isFallback: "true" }))).toMatchObject({ codEnabled: false, isActive: false, isFallback: true });
    expect(zoneInputSchema.safeParse(valid({ mode: "weight" })).success).toBe(false);
    expect(zoneInputSchema.safeParse(valid({ name: "  " })).success).toBe(false);
  });
});

describe("testDestinationSchema", () => {
  it("upper-cases the country, trims the city and accepts a blank goods total", () => {
    expect(testDestinationSchema.parse({ country: " pk ", city: " Karachi ", goodsTotal: "" })).toEqual({ country: "PK", city: "Karachi", goodsTotal: null });
    expect(testDestinationSchema.parse({ country: "GB", goodsTotal: "5000" })).toEqual({ country: "GB", city: "", goodsTotal: "5000.00" });
  });

  it("refuses an unknown country", () => {
    expect(testDestinationSchema.safeParse({ country: "XX" }).success).toBe(false);
  });
});
