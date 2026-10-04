/**
 * What the zone readers (`staff-readers.ts`) and writers (`staff-service.ts`) both need: country
 * names as the checkout shows them, and the audit values / version fingerprint of a zone and its
 * areas (S22 QA-10 split).
 */
import { getCountryOptions } from "@/config/countries";
import { fingerprint } from "@/lib/fingerprint";
import { areaToken, type ZoneAreaInput } from "./schemas";
import type { ZoneStaffRow } from "./staff-repo";

/** `Intl.DisplayNames` through the checkout's own country list (D31), so panel and storefront name countries identically. */
const countryNames = new Map(getCountryOptions().map((option) => [option.code, option.name]));
export const countryName = (code: string): string => countryNames.get(code) ?? code;

export type ZoneAuditFields = Pick<ZoneStaffRow, "name" | "mode" | "flatRate" | "freeOverAmount" | "codEnabled" | "isActive" | "isFallback">;

export function auditValues(zone: ZoneAuditFields, areas: ZoneAreaInput[]) {
  return {
    name: zone.name,
    mode: zone.mode,
    flatRate: zone.flatRate,
    freeOverAmount: zone.freeOverAmount,
    codEnabled: zone.codEnabled,
    isActive: zone.isActive,
    isFallback: zone.isFallback,
    // Sorted, so the version fingerprint (and the audit row) read the same whatever order the rows
    // came back in — the edit page sorts by country and city, the locked save reads insertion order (S22 BUG-02).
    areas: areas.map(areaToken).sort(),
  };
}

/**
 * The optimistic-concurrency token, posted back as `version`: the row's `updated_at` plus a
 * fingerprint of what the form edits (the row's fields and its areas), since `updated_at` is
 * whole-second and two saves inside one second would otherwise look the same.
 */
export function zoneVersion(row: ZoneAuditFields & Pick<ZoneStaffRow, "updatedAt">, areas: ZoneAreaInput[]): string {
  return `${row.updatedAt.getTime()}@${fingerprint(auditValues(row, areas))}`;
}
