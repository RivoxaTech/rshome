import { getShippingZoneAreas, getShippingZones } from "./repo";
import { resolveZone, type ResolvedZone } from "./zones";

/** The zone for a checkout address, or null when no zone (not even a fallback) covers it. */
export async function resolveShippingZone(country: string, city: string): Promise<ResolvedZone | null> {
  const [zones, areas] = await Promise.all([getShippingZones(), getShippingZoneAreas()]);
  return resolveZone(zones, areas, country, city);
}
