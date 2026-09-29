/**
 * Zone resolution (pure, DATABASE.md "Shipping"): an exact (country, city) area, else the
 * country's whole-country area, else the fallback zone. `repo.ts` loads the rows; `service.ts`
 * joins the two.
 */
import { decimalToPaisa } from "@/features/pricing/money";
import type { PricingZone } from "@/features/pricing/pricing";

export type ZoneRow = {
  id: number;
  name: string;
  mode: "flat" | "quote";
  flatRate: string;
  freeOverAmount: string | null;
  codEnabled: boolean;
  isFallback: boolean;
  isActive: boolean;
};

export type ZoneAreaRow = { zoneId: number; countryCode: string; city: string | null };

export type ResolvedZone = { id: number; name: string; pricing: PricingZone };

function toResolvedZone(zone: ZoneRow): ResolvedZone {
  return {
    id: zone.id,
    name: zone.name,
    pricing: {
      mode: zone.mode,
      flatRate: decimalToPaisa(zone.flatRate),
      freeOverAmount: zone.freeOverAmount === null ? null : decimalToPaisa(zone.freeOverAmount),
      codEnabled: zone.codEnabled,
    },
  };
}

export function resolveZone(zones: ZoneRow[], areas: ZoneAreaRow[], country: string, city: string): ResolvedZone | null {
  const active = new Map(zones.filter((zone) => zone.isActive).map((zone) => [zone.id, zone]));
  const countryCode = country.trim().toUpperCase();
  const cityKey = city.trim().toLowerCase();

  const matches = (area: ZoneAreaRow, areaCity: string | null) =>
    area.countryCode === countryCode && area.city === areaCity && active.has(area.zoneId);
  const exact = areas.find((area) => matches(area, cityKey)) ?? areas.find((area) => matches(area, null));
  if (exact) return toResolvedZone(active.get(exact.zoneId)!);

  const fallback = [...active.values()].find((zone) => zone.isFallback);
  return fallback ? toResolvedZone(fallback) : null;
}
