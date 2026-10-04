import "@/lib/zod-config";
import { z } from "zod";
import { COUNTRY_CODES } from "@/config/countries";
import { decimalToPaisa } from "@/features/pricing/money";
import { optionalMoneyField } from "@/features/pricing/schemas";

// The panel's shipping zone editor (S14, REQUIREMENTS DV-06): one Zod schema for the form and
// the Server Action. The row-level rules (one fallback, no area overlap, coverage, orders) need
// the other rows, so `staff-service.ts` checks them under the lock; this pins the shape.

export const ZONE_MODES = ["quote", "flat"] as const;
export type ZoneMode = (typeof ZONE_MODES)[number];
export const ZONE_MODE_LABELS: Record<ZoneMode, string> = { quote: "Quote on WhatsApp", flat: "Flat rate" };

export const MAX_ZONE_AREAS = 200;

const activeField = z.preprocess((value) => value === "true" || value === true, z.boolean());

/** An area as the form and the service exchange it: an ISO country code and, for a city-level area, the city in lowercase. */
export type ZoneAreaInput = { countryCode: string; city: string | null };

/** The stored form: lowercase, single-spaced, letters (any script), digits, spaces, hyphens, apostrophes and dots. */
const CITY_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .'-]{0,98}[\p{L}\p{N}.]$/u;

export function normalizeCity(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

/** `PK:karachi` or `GB` — what the chips editor posts, one token per area, comma-separated (D50: the wire format is the contract). */
export function areaToken(area: ZoneAreaInput): string {
  return area.city ? `${area.countryCode}:${area.city}` : area.countryCode;
}

/** Parses one token; null when it isn't a known country (or a usable city). */
export function parseAreaToken(token: string): ZoneAreaInput | null {
  const [rawCountry, ...rest] = token.trim().split(":");
  const countryCode = rawCountry.trim().toUpperCase();
  if (!COUNTRY_CODES.has(countryCode)) return null;
  const rawCity = rest.join(":");
  if (rawCity.trim() === "") return { countryCode, city: null };
  const city = normalizeCity(rawCity);
  if (!CITY_PATTERN.test(city)) return null;
  return { countryCode, city };
}

/** The posted `areas` field: tokens de-duplicated, every one a real country (and a usable city), at most `MAX_ZONE_AREAS`. */
export const zoneAreasField = z.string().max(20_000).transform((raw, ctx) => {
  const seen = new Set<string>();
  const areas: ZoneAreaInput[] = [];
  for (const token of raw.split(",")) {
    if (token.trim() === "") continue;
    const area = parseAreaToken(token);
    if (!area) {
      ctx.addIssue({ code: "custom", message: `"${token.trim()}" isn't a known country or a usable city name.` });
      return z.NEVER;
    }
    const key = areaToken(area);
    if (!seen.has(key)) {
      seen.add(key);
      areas.push(area);
    }
  }
  if (areas.length > MAX_ZONE_AREAS) {
    ctx.addIssue({ code: "custom", message: `Keep to ${MAX_ZONE_AREAS} areas or fewer per zone.` });
    return z.NEVER;
  }
  return areas;
});

export const FLAT_RATE_REQUIRED = "Enter a delivery charge above 0 for a flat-rate zone.";
export const FREE_OVER_FLAT_ONLY = "A free-delivery threshold only applies to a flat-rate zone.";

export const zoneInputSchema = z
  .object({
    name: z.string().trim().min(1, "Enter the zone's name.").max(150, "Keep this under 150 characters."),
    mode: z.enum(ZONE_MODES, { error: "Choose a mode." }),
    flatRate: optionalMoneyField,
    freeOverAmount: optionalMoneyField,
    codEnabled: activeField,
    isActive: activeField,
    /** Create only: offered when no fallback zone exists yet; the service refuses a second one. */
    isFallback: z.preprocess((value) => value === "true" || value === true, z.boolean()).default(false),
    areas: zoneAreasField,
    version: z.string().max(100).default(""),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "flat") {
      if (value.flatRate === null || decimalToPaisa(value.flatRate) <= 0) ctx.addIssue({ code: "custom", path: ["flatRate"], message: FLAT_RATE_REQUIRED });
      if (value.freeOverAmount !== null && decimalToPaisa(value.freeOverAmount) <= 0) {
        ctx.addIssue({ code: "custom", path: ["freeOverAmount"], message: "Leave blank for no free-delivery threshold, or enter an amount above 0." });
      }
    } else if (value.freeOverAmount !== null) {
      ctx.addIssue({ code: "custom", path: ["freeOverAmount"], message: FREE_OVER_FLAT_ONLY });
    }
  })
  // Quote mode keeps `flat_rate` at 0 and no threshold, whatever was left in the fields (REQUIREMENTS §6.4).
  .transform((value) => (value.mode === "quote" ? { ...value, flatRate: "0.00", freeOverAmount: null } : { ...value, flatRate: value.flatRate as string }));

export type ZoneInput = z.infer<typeof zoneInputSchema>;

/** The "Test a destination" box: a checkout country, an optional city, and an optional goods total for the free-over rule. */
export const testDestinationSchema = z.object({
  country: z
    .string()
    .trim()
    .toUpperCase()
    .refine((code) => COUNTRY_CODES.has(code), "Choose a country."),
  city: z.string().trim().max(100, "Enter a shorter city name.").default(""),
  goodsTotal: optionalMoneyField,
});
export type TestDestinationInput = z.infer<typeof testDestinationSchema>;

// Next hands repeated query keys over as arrays (?q=a&q=b); only the first counts.
const firstQueryValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

/** The list the new/edit page was opened from, for its back link: only the shipping list. */
export const zoneBackHrefSchema = z.preprocess(firstQueryValue, z.string().max(300).regex(/^\/panel\/shipping(\?[\w=&%.+-]*)?$/).optional()).catch(undefined);
