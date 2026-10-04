/**
 * The panel's shipping zone read models (S22 QA-10, split out of `staff-service.ts`): the zones
 * list, the edit page's form data, the create page's fallback check, the delete guard and the
 * "Test a destination" box. Every write stays in `staff-service.ts`.
 */
import { features } from "@/config/features";
import { decimalToPaisa, formatMoney } from "@/features/pricing/money";
import { fieldErrorsOf } from "@/lib/field-errors";
import { areaLabel, countFallbacks, describeDestination, type DestinationOutcome } from "./rules";
import { areaToken, testDestinationSchema, type ZoneAreaInput, type ZoneMode } from "./schemas";
import { resolveShippingZone } from "./service";
import { countAreasByZone, countOrdersByZone, countOrdersByZoneId, getZoneRowById, listAreasByZoneId, listZoneRows, type ZoneStaffRow } from "./staff-repo";
import { countryName, zoneVersion } from "./staff-shared";

// ── The list ────────────────────────────────────────────────────────────────────────────────────

export type StaffZoneListItem = {
  id: number;
  name: string;
  mode: ZoneMode;
  /** Formatted, or null in quote mode. */
  flatRateText: string | null;
  freeOverText: string | null;
  codEnabled: boolean;
  isActive: boolean;
  isFallback: boolean;
  areaCount: number;
  orderCount: number;
  position: number;
};

export async function listStaffZones(): Promise<StaffZoneListItem[]> {
  const [rows, areaCounts, orderCounts] = await Promise.all([listZoneRows(), countAreasByZone(), countOrdersByZone()]);
  return rows.map((row, index) => ({
    id: row.id,
    name: row.name,
    mode: row.mode,
    flatRateText: row.mode === "flat" ? formatMoney(decimalToPaisa(row.flatRate)) : null,
    freeOverText: row.mode === "flat" && row.freeOverAmount !== null ? formatMoney(decimalToPaisa(row.freeOverAmount)) : null,
    codEnabled: row.codEnabled,
    isActive: row.isActive,
    isFallback: row.isFallback,
    areaCount: areaCounts.get(row.id) ?? 0,
    orderCount: orderCounts.get(row.id) ?? 0,
    position: index + 1,
  }));
}

// ── The edit page ───────────────────────────────────────────────────────────────────────────────

export type ZoneAreaView = ZoneAreaInput & { token: string; label: string };

type ZoneEditFormData = {
  zone: ZoneStaffRow;
  areas: ZoneAreaView[];
  version: string;
  orderCount: number;
  /** Whether the Pakistan rule note applies: a zone whose areas aren't all Pakistani never gets COD whatever its switch says. */
  coversOutsidePakistan: boolean;
};

function toAreaView(area: ZoneAreaInput): ZoneAreaView {
  return { ...area, token: areaToken(area), label: areaLabel(area, countryName) };
}

export async function getZoneForEdit(id: number): Promise<ZoneEditFormData | null> {
  const zone = await getZoneRowById(id);
  if (!zone) return null;
  const [areas, orderCount] = await Promise.all([listAreasByZoneId(id), countOrdersByZoneId(id)]);
  return {
    zone,
    areas: areas.map(toAreaView),
    version: zoneVersion(zone, areas),
    orderCount,
    coversOutsidePakistan: zone.isFallback || areas.some((area) => area.countryCode !== "PK"),
  };
}

/** Whether a brand-new zone may be offered the "rest of world" flag: only while no fallback exists at all. */
export async function fallbackExists(): Promise<boolean> {
  return countFallbacks(await listZoneRows()) > 0;
}

// ── Delete guard ────────────────────────────────────────────────────────────────────────────────

export type ZoneDeleteGuard = { allowed: true } | { allowed: false; reason: "fallback" } | { allowed: false; reason: "orders"; orderCount: number };

/** What the delete dialog shows up front; the server refuses regardless under the lock. */
export async function checkZoneDeletable(id: number): Promise<ZoneDeleteGuard> {
  const [zone, orderCount] = await Promise.all([getZoneRowById(id), countOrdersByZoneId(id)]);
  if (zone?.isFallback) return { allowed: false, reason: "fallback" };
  if (orderCount > 0) return { allowed: false, reason: "orders", orderCount };
  return { allowed: true };
}

// ── "Test a destination" ────────────────────────────────────────────────────────────────────────

export type TestDestinationResult =
  | { ok: true; destination: string; outcome: DestinationOutcome; deliveryText: string; codText: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Runs the real resolver and pricing functions for one address — exactly what the checkout would do. */
export async function testDestination(rawInput: unknown): Promise<TestDestinationResult> {
  const parsed = testDestinationSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form.", fieldErrors: fieldErrorsOf(parsed.error) };
  const input = parsed.data;

  const zone = await resolveShippingZone(input.country, input.city);
  const goodsTotal = input.goodsTotal === null ? 0 : decimalToPaisa(input.goodsTotal);
  const outcome = describeDestination(zone, input.country, goodsTotal, { coupons: features.coupons, cod: features.cod });

  const destination = input.city ? `${input.city}, ${countryName(input.country)}` : countryName(input.country);
  if (!outcome.zone || !outcome.delivery) {
    return { ok: true, destination, outcome, deliveryText: "No zone covers this address — the checkout would refuse the order.", codText: "Not offered" };
  }
  const deliveryText =
    outcome.delivery.kind === "quote"
      ? "Delivery charge to be confirmed on WhatsApp (quote mode)"
      : outcome.delivery.kind === "free"
        ? "Free delivery (the goods total meets the free-over threshold)"
        : `Flat delivery charge of ${formatMoney(outcome.delivery.amount)}`;
  const codText = outcome.codAvailable
    ? "Offered"
    : input.country !== "PK"
      ? "Not offered — COD is Pakistan-only, whatever the zone's switch says"
      : "Not offered — switched off for this zone";
  return { ok: true, destination, outcome, deliveryText, codText };
}
