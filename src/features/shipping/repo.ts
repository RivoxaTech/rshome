import { db } from "@/server/db/client";
import { shippingZoneAreas, shippingZones } from "@/server/db/schema/shipping";
import type { ZoneAreaRow, ZoneRow } from "./zones";

/** A handful of rows: the whole table is loaded and matched in `zones.ts`. */
export function getShippingZones(): Promise<ZoneRow[]> {
  return db
    .select({
      id: shippingZones.id,
      name: shippingZones.name,
      mode: shippingZones.mode,
      flatRate: shippingZones.flatRate,
      freeOverAmount: shippingZones.freeOverAmount,
      codEnabled: shippingZones.codEnabled,
      isFallback: shippingZones.isFallback,
      isActive: shippingZones.isActive,
    })
    .from(shippingZones);
}

export function getShippingZoneAreas(): Promise<ZoneAreaRow[]> {
  return db
    .select({ zoneId: shippingZoneAreas.zoneId, countryCode: shippingZoneAreas.countryCode, city: shippingZoneAreas.city })
    .from(shippingZoneAreas);
}
