/**
 * The panel's shipping zone writes (S14, REQUIREMENTS DV-06, `shipping.manage`). Every write locks
 * every zone row and every area row (`SELECT … FOR UPDATE`, one transaction — the table is a
 * handful of rows and the one-fallback and coverage rules need the whole set), re-checks the
 * rules below, writes, and records an `audit_logs` row with old/new values (CLAUDE.md #10).
 * Refusals come back as `{ ok: false }`, never a throw. Nothing here changes a past order (orders
 * snapshot their totals) or an in-flight checkout, which recomputes under its own lock. The read
 * models (list, edit form, delete guard, "test a destination") are `staff-readers.ts` (S22 QA-10).
 */
import { insertAuditLog } from "@/features/audit/repo";
import type { StaffActionResult } from "@/features/catalog/staff-service";
import { moveId, renormalize, type Placement } from "@/features/catalog/ordering";
import { StaffActionError, invalidInput, refusal } from "@/features/shared/staff-result";
import { db } from "@/server/db/client";
import { areaLabel, countFallbacks, findAreaConflicts, newCoverageGaps } from "./rules";
import { zoneInputSchema, type ZoneAreaInput, type ZoneInput } from "./schemas";
import {
  countOrdersByZoneId,
  deleteZone,
  insertZone,
  lockAllAreas,
  lockAllZones,
  replaceZoneAreas,
  updateZone,
  updateZoneSortOrders,
  type ZoneStaffRow,
} from "./staff-repo";
import { auditValues, countryName, zoneVersion } from "./staff-shared";
import type { ZoneAreaRow, ZoneRow } from "./zones";

export type { StaffActionResult };

type Actor = { id: number };

export const STALE_ZONE_MESSAGE = "Someone else changed this zone after you opened it. Reload to see their changes, then make yours again.";
export const FALLBACK_PROTECTED_MESSAGE = "The rest-of-world zone covers every address no other zone does, so it can't be deleted or deactivated.";
export const ONE_FALLBACK_MESSAGE = "There is already a rest-of-world zone; only one zone can be the fallback.";

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

// ── Shared checks under the lock ────────────────────────────────────────────────────────────────

function assertNoAreaConflicts(existing: ZoneAreaRow[], ownZoneId: number | null, wanted: ZoneAreaInput[], zones: ZoneStaffRow[]): void {
  const conflicts = findAreaConflicts(existing, ownZoneId, wanted);
  if (conflicts.length === 0) return;
  const first = conflicts[0];
  const owner = zones.find((zone) => zone.id === first.zoneId)?.name ?? `zone #${first.zoneId}`;
  const more = conflicts.length > 1 ? ` (and ${conflicts.length - 1} more)` : "";
  throw new StaffActionError(`${areaLabel(first.area, countryName)} already belongs to "${owner}"${more}. An area can only be in one zone.`, "areas");
}

type ZoneSet = { zones: ZoneRow[]; areas: ZoneAreaRow[] };

/** Refuses a change that would newly leave a checkout destination with no zone (the real resolver decides), or no active zone at all. */
function assertCoverage(before: ZoneSet, after: ZoneSet, what: string): void {
  if (before.zones.some((zone) => zone.isActive) && !after.zones.some((zone) => zone.isActive)) {
    throw new StaffActionError(`${what} would leave no active delivery zone at all.`);
  }
  const gaps = newCoverageGaps(before, after);
  if (gaps.length === 0) return;
  const first = gaps[0];
  const place = first.city ? areaLabel({ countryCode: first.country, city: first.city }, countryName) : countryName(first.country);
  const more = gaps.length > 1 ? ` and ${gaps.length - 1} other ${gaps.length === 2 ? "destination" : "destinations"}` : "";
  throw new StaffActionError(`${what} would leave ${place}${more} with no delivery zone.`);
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
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  try {
    const id = await db.transaction(async (tx) => {
      const zones = await lockAllZones(tx);
      const areas = await lockAllAreas(tx);
      if (input.isFallback && countFallbacks(zones) > 0) throw new StaffActionError(ONE_FALLBACK_MESSAGE, "isFallback");
      if (input.isFallback && !input.isActive) throw new StaffActionError("The rest-of-world zone must be active.", "isActive");
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
    if (error instanceof StaffActionError) return refusal(error);
    throw error;
  }
}

// ── Update ──────────────────────────────────────────────────────────────────────────────────────

export async function updateZoneById(id: number, rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = zoneInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const zones = await lockAllZones(tx);
      const areas = await lockAllAreas(tx);
      const current = zones.find((zone) => zone.id === id);
      if (!current) throw new StaffActionError("Zone not found.");
      const currentAreas = areas.filter((area) => area.zoneId === id).map(({ countryCode, city }) => ({ countryCode, city }));
      if (zoneVersion(current, currentAreas) !== input.version) throw new StaffActionError(STALE_ZONE_MESSAGE);
      // The fallback flag isn't editable here; the rest-of-world zone must also stay active.
      if (current.isFallback && !input.isActive) throw new StaffActionError(FALLBACK_PROTECTED_MESSAGE, "isActive");
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
    if (error instanceof StaffActionError) return refusal(error);
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
      if (!current) throw new StaffActionError("Zone not found.");
      if (current.isActive === isActive) throw new StaffActionError(`This zone is already ${isActive ? "active" : "inactive"}.`);
      if (current.isFallback && !isActive) throw new StaffActionError(FALLBACK_PROTECTED_MESSAGE);
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
    if (error instanceof StaffActionError) return refusal(error);
    throw error;
  }
}

// ── Delete ──────────────────────────────────────────────────────────────────────────────────────

function orderedMessage(orderCount: number): string {
  return `${orderCount} ${orderCount === 1 ? "order was" : "orders were"} delivered through this zone, so it can't be deleted — those orders keep their record of it. Deactivate it instead.`;
}

export async function deleteZoneById(id: number, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const zones = await lockAllZones(tx);
      const areas = await lockAllAreas(tx);
      const current = zones.find((zone) => zone.id === id);
      if (!current) throw new StaffActionError("Zone not found.");
      if (current.isFallback) throw new StaffActionError(FALLBACK_PROTECTED_MESSAGE);
      const orderCount = await countOrdersByZoneId(id, tx);
      if (orderCount > 0) throw new StaffActionError(orderedMessage(orderCount));
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
    if (error instanceof StaffActionError) return refusal(error);
    throw error;
  }
}

// ── Sort order ──────────────────────────────────────────────────────────────────────────────────

/** A per-row "Move to top/end/position" (the `MoveToControl` shape, D53); the order only drives the panel list. */
export async function moveZone(input: { zoneId: number; placement: Placement }, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const zones = await lockAllZones(tx);
      if (!zones.some((zone) => zone.id === input.zoneId)) throw new StaffActionError("Zone not found.");
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
    if (error instanceof StaffActionError) return refusal(error);
    throw error;
  }
}
