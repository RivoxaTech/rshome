/**
 * The panel's shipping zone editor (S14): DB access only, no business rules (ARCHITECTURE.md §2)
 * — `staff-service.ts` owns the fallback, overlap, coverage and orders rules and the audit rows.
 * `repo.ts` stays the checkout's read path.
 */
import { asc, count, eq, inArray, sql } from "drizzle-orm";
import { db, type DbClient } from "@/server/db/client";
import { orders } from "@/server/db/schema/orders";
import { shippingZoneAreas, shippingZones } from "@/server/db/schema/shipping";
import type { ZoneAreaInput } from "./schemas";
import type { ZoneAreaRow } from "./zones";

export type ZoneStaffRow = typeof shippingZones.$inferSelect;
type ZoneUpdate = Partial<typeof shippingZones.$inferInsert>;

/** Every zone in display order (a handful of rows). */
export function listZoneRows(client: DbClient = db): Promise<ZoneStaffRow[]> {
  return client.select().from(shippingZones).orderBy(asc(shippingZones.sortOrder), asc(shippingZones.id));
}

export async function getZoneRowById(id: number): Promise<ZoneStaffRow | undefined> {
  const [row] = await db.select().from(shippingZones).where(eq(shippingZones.id, id));
  return row;
}

/** `SELECT … FOR UPDATE` on *every* zone: the one-fallback and coverage rules need the whole set to hold still. */
export function lockAllZones(tx: DbClient): Promise<ZoneStaffRow[]> {
  return tx.select().from(shippingZones).orderBy(asc(shippingZones.sortOrder), asc(shippingZones.id)).for("update");
}

/** Every area, locked alongside the zones (an area belongs to exactly one zone; the unique index is the backstop). */
export function lockAllAreas(tx: DbClient): Promise<ZoneAreaRow[]> {
  return tx.select({ zoneId: shippingZoneAreas.zoneId, countryCode: shippingZoneAreas.countryCode, city: shippingZoneAreas.city }).from(shippingZoneAreas).for("update");
}

export function listAreasByZoneId(zoneId: number, client: DbClient = db): Promise<ZoneAreaInput[]> {
  return client
    .select({ countryCode: shippingZoneAreas.countryCode, city: shippingZoneAreas.city })
    .from(shippingZoneAreas)
    .where(eq(shippingZoneAreas.zoneId, zoneId))
    .orderBy(asc(shippingZoneAreas.countryCode), asc(shippingZoneAreas.city));
}

/** Area counts per zone, for the list. */
export async function countAreasByZone(): Promise<Map<number, number>> {
  const rows = await db.select({ zoneId: shippingZoneAreas.zoneId, n: count() }).from(shippingZoneAreas).groupBy(shippingZoneAreas.zoneId);
  return new Map(rows.map((row) => [row.zoneId, row.n]));
}

/** Orders per zone (any status) — a zone with orders can only be deactivated, never deleted. */
export async function countOrdersByZone(client: DbClient = db): Promise<Map<number, number>> {
  const rows = await client
    .select({ zoneId: orders.shippingZoneId, n: count() })
    .from(orders)
    .where(sql`${orders.shippingZoneId} IS NOT NULL`)
    .groupBy(orders.shippingZoneId);
  return new Map(rows.flatMap((row) => (row.zoneId === null ? [] : [[row.zoneId, row.n] as const])));
}

export async function countOrdersByZoneId(zoneId: number, client: DbClient = db): Promise<number> {
  const [row] = await client.select({ n: count() }).from(orders).where(eq(orders.shippingZoneId, zoneId));
  return row?.n ?? 0;
}

export async function insertZone(tx: DbClient, values: typeof shippingZones.$inferInsert): Promise<number> {
  const [result] = await tx.insert(shippingZones).values(values);
  return result.insertId;
}

export async function updateZone(tx: DbClient, id: number, values: ZoneUpdate): Promise<void> {
  await tx.update(shippingZones).set(values).where(eq(shippingZones.id, id));
}

export async function deleteZone(tx: DbClient, id: number): Promise<void> {
  await tx.delete(shippingZoneAreas).where(eq(shippingZoneAreas.zoneId, id));
  await tx.delete(shippingZones).where(eq(shippingZones.id, id));
}

/** Replaces a zone's areas wholesale — a few rows, so delete-then-insert is simpler than a diff. */
export async function replaceZoneAreas(tx: DbClient, zoneId: number, areas: ZoneAreaInput[]): Promise<void> {
  await tx.delete(shippingZoneAreas).where(eq(shippingZoneAreas.zoneId, zoneId));
  if (areas.length > 0) await tx.insert(shippingZoneAreas).values(areas.map((area) => ({ zoneId, countryCode: area.countryCode, city: area.city })));
}

/** One statement for every changed position (the catalogue ordering pattern, D51). */
export async function updateZoneSortOrders(tx: DbClient, positions: Map<number, number>): Promise<void> {
  if (positions.size === 0) return;
  const ids = [...positions.keys()];
  const cases = sql.join(
    ids.map((id) => sql`WHEN ${id} THEN ${positions.get(id)}`),
    sql` `,
  );
  await tx
    .update(shippingZones)
    .set({ sortOrder: sql`CASE ${shippingZones.id} ${cases} END` })
    .where(inArray(shippingZones.id, ids));
}
