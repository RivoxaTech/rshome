/**
 * The panel's shipping zone editor (S14, REQUIREMENTS DV-06, `shipping.manage`). Every write locks
 * every zone row and every area row (`SELECT … FOR UPDATE`, one transaction — the table is a
 * handful of rows and the one-fallback and coverage rules need the whole set), re-checks the
 * rules below, writes, and records an `audit_logs` row with old/new values (CLAUDE.md #10).
 * Refusals come back as `{ ok: false }`, never a throw. Nothing here changes a past order (orders
 * snapshot their totals) or an in-flight checkout, which recomputes under its own lock.
 */
import type { ZodError } from "zod";
import { getCountryOptions } from "@/config/countries";
import { features } from "@/config/features";
import { insertAuditLog } from "@/features/audit/repo";
import type { StaffActionResult } from "@/features/catalog/staff-service";
import { moveId, renormalize, type Placement } from "@/features/catalog/ordering";
import { fieldErrorsOf } from "@/features/checkout/schemas";
import { decimalToPaisa, formatMoney } from "@/features/pricing/money";
import { fingerprint } from "@/lib/fingerprint";
import { db } from "@/server/db/client";
import { areaLabel, countFallbacks, describeDestination, findAreaConflicts, newCoverageGaps, type DestinationOutcome } from "./rules";
import { areaToken, testDestinationSchema, zoneInputSchema, type ZoneAreaInput, type ZoneInput, type ZoneMode } from "./schemas";
import { resolveShippingZone } from "./service";
import {
  countAreasByZone,
  countOrdersByZone,
  countOrdersByZoneId,
  deleteZone,
  getZoneRowById,
  insertZone,
  listAreasByZoneId,
  listZoneRows,
  lockAllAreas,
  lockAllZones,
  replaceZoneAreas,
  updateZone,
  updateZoneSortOrders,
  type ZoneStaffRow,
} from "./staff-repo";
import type { ZoneAreaRow, ZoneRow } from "./zones";

export type { StaffActionResult };

type Actor = { id: number };

export const STALE_ZONE_MESSAGE = "Someone else changed this zone after you opened it. Reload to see their changes, then make yours again.";
export const FALLBACK_PROTECTED_MESSAGE = "The rest-of-world zone covers every address no other zone does, so it can't be deleted or deactivated.";
export const ONE_FALLBACK_MESSAGE = "There is already a rest-of-world zone; only one zone can be the fallback.";

/** A refusal staff see; anything else thrown is a real failure and rolls the transaction back. */
class ZoneActionError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

function invalid(error: ZodError): StaffActionResult {
  return { ok: false, error: error.issues[0]?.message ?? "Please check the form.", fieldErrors: fieldErrorsOf(error) };
}

function refused(error: ZoneActionError): StaffActionResult {
  return error.field ? { ok: false, error: error.message, fieldErrors: { [error.field]: error.message } } : { ok: false, error: error.message };
}

/** `Intl.DisplayNames` through the checkout's own country list (D31), so panel and storefront name countries identically. */
const countryNames = new Map(getCountryOptions().map((option) => [option.code, option.name]));
export const countryName = (code: string): string => countryNames.get(code) ?? code;

/**
 * The optimistic-concurrency token, posted back as `version`: the row's `updated_at` plus a
 * fingerprint of what the form edits (the row's fields and its areas), since `updated_at` is
 * whole-second and two saves inside one second would otherwise look the same.
 */
export function zoneVersion(row: ZoneAuditFields & Pick<ZoneStaffRow, "updatedAt">, areas: ZoneAreaInput[]): string {
  return `${row.updatedAt.getTime()}@${fingerprint(auditValues(row, areas))}`;
}

function toZoneRow(row: ZoneStaffRow): ZoneRow {
  return {
    id: row.id,
    name: row.name,
    mode: row.mode,
    flatRate: row.flatRate,
    freeOverAmount: row.freeOverAmount,
    codEnabled: row.codEnabled,
    isFallback: row.isFallback,
    isActive: row.isActive,
  };
}

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

export type ZoneEditFormData = {
  zone: ZoneStaffRow;
  areas: ZoneAreaView[];
  version: string;
  orderCount: number;
  /** Whether the Pakistan rule note applies: a zone whose areas aren't all Pakistani never gets COD whatever its switch says. */
  coversOutsidePakistan: boolean;
};

export function toAreaView(area: ZoneAreaInput): ZoneAreaView {
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

// ── Shared checks under the lock ────────────────────────────────────────────────────────────────

function assertNoAreaConflicts(existing: ZoneAreaRow[], ownZoneId: number | null, wanted: ZoneAreaInput[], zones: ZoneStaffRow[]): void {
  const conflicts = findAreaConflicts(existing, ownZoneId, wanted);
  if (conflicts.length === 0) return;
  const first = conflicts[0];
  const owner = zones.find((zone) => zone.id === first.zoneId)?.name ?? `zone #${first.zoneId}`;
  const more = conflicts.length > 1 ? ` (and ${conflicts.length - 1} more)` : "";
  throw new ZoneActionError(`${areaLabel(first.area, countryName)} already belongs to "${owner}"${more}. An area can only be in one zone.`, "areas");
}

type ZoneSet = { zones: ZoneRow[]; areas: ZoneAreaRow[] };

/** Refuses a change that would newly leave a checkout destination with no zone (the real resolver decides), or no active zone at all. */
function assertCoverage(before: ZoneSet, after: ZoneSet, what: string): void {
  if (before.zones.some((zone) => zone.isActive) && !after.zones.some((zone) => zone.isActive)) {
    throw new ZoneActionError(`${what} would leave no active delivery zone at all.`);
  }
  const gaps = newCoverageGaps(before, after);
  if (gaps.length === 0) return;
  const first = gaps[0];
  const place = first.city ? areaLabel({ countryCode: first.country, city: first.city }, countryName) : countryName(first.country);
  const more = gaps.length > 1 ? ` and ${gaps.length - 1} other ${gaps.length === 2 ? "destination" : "destinations"}` : "";
  throw new ZoneActionError(`${what} would leave ${place}${more} with no delivery zone.`);
}

type ZoneAuditFields = Pick<ZoneStaffRow, "name" | "mode" | "flatRate" | "freeOverAmount" | "codEnabled" | "isActive" | "isFallback">;

function auditValues(zone: ZoneAuditFields, areas: ZoneAreaInput[]) {
  return {
    name: zone.name,
    mode: zone.mode,
    flatRate: zone.flatRate,
    freeOverAmount: zone.freeOverAmount,
    codEnabled: zone.codEnabled,
    isActive: zone.isActive,
    isFallback: zone.isFallback,
    areas: areas.map(areaToken),
  };
}

function toRow(input: ZoneInput) {
  return {
    name: input.name,
    mode: input.mode,
    flatRate: input.flatRate,
    freeOverAmount: input.freeOverAmount,
    codEnabled: input.codEnabled,
    isActive: input.isActive,
  };
}

// ── Create ──────────────────────────────────────────────────────────────────────────────────────

export async function createZone(rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = zoneInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  try {
    const id = await db.transaction(async (tx) => {
      const zones = await lockAllZones(tx);
      const areas = await lockAllAreas(tx);
      if (input.isFallback && countFallbacks(zones) > 0) throw new ZoneActionError(ONE_FALLBACK_MESSAGE, "isFallback");
      if (input.isFallback && !input.isActive) throw new ZoneActionError("The rest-of-world zone must be active.", "isActive");
      assertNoAreaConflicts(areas, null, input.areas, zones);

      const now = new Date();
      const id = await insertZone(tx, { ...toRow(input), isFallback: input.isFallback, sortOrder: zones.length, createdAt: now, updatedAt: now });
      await replaceZoneAreas(tx, id, input.areas);
      await insertAuditLog(tx, {
        userId: actor.id,
        action: "shipping_zone.create",
        entity: "shipping_zone",
        entityId: id,
        oldValues: null,
        newValues: auditValues({ ...toRow(input), isFallback: input.isFallback }, input.areas),
        createdAt: now,
      });
      return id;
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof ZoneActionError) return refused(error);
    throw error;
  }
}

// ── Update ──────────────────────────────────────────────────────────────────────────────────────

export async function updateZoneById(id: number, rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = zoneInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const zones = await lockAllZones(tx);
      const areas = await lockAllAreas(tx);
      const current = zones.find((zone) => zone.id === id);
      if (!current) throw new ZoneActionError("Zone not found.");
      const currentAreas = areas.filter((area) => area.zoneId === id).map(({ countryCode, city }) => ({ countryCode, city }));
      if (zoneVersion(current, currentAreas) !== input.version) throw new ZoneActionError(STALE_ZONE_MESSAGE);
      // The fallback flag isn't editable here; the rest-of-world zone must also stay active.
      if (current.isFallback && !input.isActive) throw new ZoneActionError(FALLBACK_PROTECTED_MESSAGE, "isActive");
      assertNoAreaConflicts(areas, id, input.areas, zones);

      // Deactivating, or moving areas out of, this zone must not strand a checkout destination.
      const nextZones = zones.map((zone) => (zone.id === id ? { ...zone, ...toRow(input) } : zone)).map(toZoneRow);
      const nextAreas = [...areas.filter((area) => area.zoneId !== id), ...input.areas.map((area) => ({ zoneId: id, ...area }))];
      assertCoverage({ zones: zones.map(toZoneRow), areas }, { zones: nextZones, areas: nextAreas }, "Saving this zone");

      const now = new Date();
      await updateZone(tx, id, { ...toRow(input), updatedAt: now });
      await replaceZoneAreas(tx, id, input.areas);

      await insertAuditLog(tx, {
        userId: actor.id,
        action: "shipping_zone.update",
        entity: "shipping_zone",
        entityId: id,
        oldValues: auditValues(current, currentAreas),
        newValues: auditValues({ ...toRow(input), isFallback: current.isFallback }, input.areas),
        createdAt: now,
      });
      if (input.isActive !== current.isActive) {
        await insertAuditLog(tx, {
          userId: actor.id,
          action: input.isActive ? "shipping_zone.activate" : "shipping_zone.deactivate",
          entity: "shipping_zone",
          entityId: id,
          oldValues: { isActive: current.isActive },
          newValues: { isActive: input.isActive },
          createdAt: now,
        });
      }
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof ZoneActionError) return refused(error);
    throw error;
  }
}

// ── Activate / deactivate ───────────────────────────────────────────────────────────────────────

export async function setZoneActive(id: number, isActive: boolean, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const zones = await lockAllZones(tx);
      const areas = await lockAllAreas(tx);
      const current = zones.find((zone) => zone.id === id);
      if (!current) throw new ZoneActionError("Zone not found.");
      if (current.isActive === isActive) throw new ZoneActionError(`This zone is already ${isActive ? "active" : "inactive"}.`);
      if (current.isFallback && !isActive) throw new ZoneActionError(FALLBACK_PROTECTED_MESSAGE);
      if (!isActive) {
        assertCoverage({ zones: zones.map(toZoneRow), areas }, { zones: zones.map((zone) => toZoneRow(zone.id === id ? { ...zone, isActive } : zone)), areas }, `Deactivating "${current.name}"`);
      }

      const now = new Date();
      await updateZone(tx, id, { isActive, updatedAt: now });
      await insertAuditLog(tx, {
        userId: actor.id,
        action: isActive ? "shipping_zone.activate" : "shipping_zone.deactivate",
        entity: "shipping_zone",
        entityId: id,
        oldValues: { isActive: current.isActive },
        newValues: { isActive },
        createdAt: now,
      });
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof ZoneActionError) return refused(error);
    throw error;
  }
}

// ── Delete ──────────────────────────────────────────────────────────────────────────────────────

export type ZoneDeleteGuard = { allowed: true } | { allowed: false; reason: "fallback" } | { allowed: false; reason: "orders"; orderCount: number };

/** What the delete dialog shows up front; the server refuses regardless under the lock. */
export async function checkZoneDeletable(id: number): Promise<ZoneDeleteGuard> {
  const [zone, orderCount] = await Promise.all([getZoneRowById(id), countOrdersByZoneId(id)]);
  if (zone?.isFallback) return { allowed: false, reason: "fallback" };
  if (orderCount > 0) return { allowed: false, reason: "orders", orderCount };
  return { allowed: true };
}

function orderedMessage(orderCount: number): string {
  return `${orderCount} ${orderCount === 1 ? "order was" : "orders were"} delivered through this zone, so it can't be deleted — those orders keep their record of it. Deactivate it instead.`;
}

export async function deleteZoneById(id: number, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const zones = await lockAllZones(tx);
      const areas = await lockAllAreas(tx);
      const current = zones.find((zone) => zone.id === id);
      if (!current) throw new ZoneActionError("Zone not found.");
      if (current.isFallback) throw new ZoneActionError(FALLBACK_PROTECTED_MESSAGE);
      const orderCount = await countOrdersByZoneId(id, tx);
      if (orderCount > 0) throw new ZoneActionError(orderedMessage(orderCount));
      const remaining = zones.filter((zone) => zone.id !== id);
      assertCoverage(
        { zones: zones.map(toZoneRow), areas },
        { zones: remaining.map(toZoneRow), areas: areas.filter((area) => area.zoneId !== id) },
        `Deleting "${current.name}"`,
      );

      const now = new Date();
      const currentAreas = areas.filter((area) => area.zoneId === id).map(({ countryCode, city }) => ({ countryCode, city }));
      await deleteZone(tx, id);
      await updateZoneSortOrders(tx, renormalize(remaining.map((zone) => zone.id)));
      await insertAuditLog(tx, { userId: actor.id, action: "shipping_zone.delete", entity: "shipping_zone", entityId: id, oldValues: auditValues(current, currentAreas), newValues: {}, createdAt: now });
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof ZoneActionError) return refused(error);
    throw error;
  }
}

// ── Sort order ──────────────────────────────────────────────────────────────────────────────────

/** A per-row "Move to top/end/position" (the `MoveToControl` shape, D53); the order only drives the panel list. */
export async function moveZone(input: { zoneId: number; placement: Placement }, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const zones = await lockAllZones(tx);
      if (!zones.some((zone) => zone.id === input.zoneId)) throw new ZoneActionError("Zone not found.");
      const before = zones.map((zone) => zone.id);
      const after = moveId(before, input.zoneId, input.placement);
      if (after.every((id, index) => id === before[index])) return;
      await updateZoneSortOrders(tx, renormalize(after));
      await insertAuditLog(tx, {
        userId: actor.id,
        action: "shipping_zone.sort_change",
        entity: "shipping_zone_order",
        entityId: "zones",
        oldValues: { orderedIds: before },
        newValues: { orderedIds: after },
        createdAt: new Date(),
      });
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof ZoneActionError) return refused(error);
    throw error;
  }
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
