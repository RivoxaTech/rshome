/**
 * The zone editor's rules on plain data (S14, pure — no DB), checked by `staff-service.ts` under
 * the row lock. Coverage and the destination tester both run the real `resolveZone`, never a
 * second copy of the resolution rule (CLAUDE.md #5: pricing/shipping maths has one home).
 */
import { COUNTRY_CODES, DEFAULT_COUNTRY } from "@/config/countries";
import type { Paisa } from "@/features/pricing/money";
import { calculateShipping, isCodAvailable, type PricingFlags } from "@/features/pricing/pricing";
import type { ZoneAreaInput } from "./schemas";
import { resolveZone, type ResolvedZone, type ZoneAreaRow, type ZoneRow } from "./zones";

/** Karachi has its own seeded zone, so the checkout's "Karachi / other city" picker is tested as two destinations. */
const KARACHI = "karachi";

/** Every destination the checkout can produce: each country with no city, plus Karachi for Pakistan. */
export function checkoutDestinations(): { country: string; city: string }[] {
  return [{ country: DEFAULT_COUNTRY, city: KARACHI }, ...[...COUNTRY_CODES].map((country) => ({ country, city: "" }))];
}

type Destination = { country: string; city: string };

/** The checkout destinations that would resolve to no zone at all with this zone set — empty when every address is covered. */
export function coverageGaps(zones: ZoneRow[], areas: ZoneAreaRow[]): Destination[] {
  return checkoutDestinations().filter((destination) => resolveZone(zones, areas, destination.country, destination.city) === null);
}

/**
 * The destinations a change would newly strand: covered before, uncovered after. A gap that
 * already existed isn't the change's fault and never blocks it (the fallback rule is what
 * guarantees coverage in a normal setup; this guards a database that has none).
 */
export function newCoverageGaps(before: { zones: ZoneRow[]; areas: ZoneAreaRow[] }, after: { zones: ZoneRow[]; areas: ZoneAreaRow[] }): Destination[] {
  const already = new Set(coverageGaps(before.zones, before.areas).map((gap) => `${gap.country}:${gap.city}`));
  return coverageGaps(after.zones, after.areas).filter((gap) => !already.has(`${gap.country}:${gap.city}`));
}

type AreaConflict = { area: ZoneAreaInput; zoneId: number };

/** The wanted areas already owned by *another* zone (an area belongs to exactly one zone). */
export function findAreaConflicts(existing: ZoneAreaRow[], ownZoneId: number | null, wanted: ZoneAreaInput[]): AreaConflict[] {
  const owners = new Map(existing.map((area) => [`${area.countryCode}:${area.city ?? ""}`, area.zoneId]));
  const conflicts: AreaConflict[] = [];
  for (const area of wanted) {
    const owner = owners.get(`${area.countryCode}:${area.city ?? ""}`);
    if (owner !== undefined && owner !== ownZoneId) conflicts.push({ area, zoneId: owner });
  }
  return conflicts;
}

export function countFallbacks(zones: readonly Pick<ZoneRow, "isFallback">[]): number {
  return zones.filter((zone) => zone.isFallback).length;
}

type DeliveryOutcome = { kind: "quote" } | { kind: "flat"; amount: Paisa } | { kind: "free" };

export type DestinationOutcome = {
  zone: { id: number; name: string } | null;
  delivery: DeliveryOutcome | null;
  codAvailable: boolean;
};

/** What the checkout would show for a resolved zone and goods total: the real pricing functions, no new logic. */
export function describeDestination(zone: ResolvedZone | null, country: string, goodsTotal: Paisa, flags: PricingFlags): DestinationOutcome {
  if (!zone) return { zone: null, delivery: null, codAvailable: false };
  const shipping = calculateShipping(zone.pricing, goodsTotal);
  const delivery: DeliveryOutcome = shipping.status === "pending" ? { kind: "quote" } : shipping.amount === 0 ? { kind: "free" } : { kind: "flat", amount: shipping.amount };
  return { zone: { id: zone.id, name: zone.name }, delivery, codAvailable: isCodAvailable(zone.pricing, country, flags) };
}

/** "Karachi, Pakistan" or "United Kingdom" — for chips, conflicts and the audit row. */
export function areaLabel(area: ZoneAreaInput, countryName: (code: string) => string): string {
  const country = countryName(area.countryCode);
  if (!area.city) return country;
  const city = area.city.replace(/(^|[\s-])\p{L}/gu, (match) => match.toUpperCase());
  return `${city}, ${country}`;
}
