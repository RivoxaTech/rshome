/**
 * The panel's coupons CRUD (S13): DB access only, no business rules (ARCHITECTURE.md §2) —
 * `staff-service.ts` owns the code-unique, usage-limit and delete rules, status computation and
 * audit rows. `repo.ts` stays the storefront/checkout read path.
 */
import { and, count, desc, eq, inArray, like, ne } from "drizzle-orm";
import { db, type DbClient } from "@/server/db/client";
import { orders } from "@/server/db/schema/orders";
import { couponUsages, coupons } from "@/server/db/schema/promotions";

export type CouponRow = typeof coupons.$inferSelect;
export type CouponUpdate = Partial<typeof coupons.$inferInsert>;

/** LIKE treats `%` and `_` as wildcards and `\` as its escape: a search is matched literally. */
const contains = (text: string) => `%${text.replace(/[%_]/g, "\\$&")}%`;

/**
 * Every coupon (optionally code-searched), newest first. A handful of rows: the status tabs and
 * pagination are computed in memory by the service, through the pricing module's own rule.
 */
export function listAllCoupons(search?: string): Promise<CouponRow[]> {
  return db
    .select()
    .from(coupons)
    .where(search ? like(coupons.code, contains(search.toUpperCase())) : undefined)
    .orderBy(desc(coupons.createdAt), desc(coupons.id));
}

export async function getCouponById(id: number): Promise<CouponRow | undefined> {
  const [row] = await db.select().from(coupons).where(eq(coupons.id, id));
  return row;
}

/** `SELECT … FOR UPDATE` on the coupon row: every staff write runs its checks under this lock. */
export async function lockCouponById(tx: DbClient, id: number): Promise<CouponRow | undefined> {
  const [row] = await tx.select().from(coupons).where(eq(coupons.id, id)).for("update");
  return row;
}

/** True when another coupon (not `excludeId`) already uses this (normalised, uppercase) code. */
export async function codeInUse(code: string, excludeId?: number): Promise<boolean> {
  const where = excludeId ? and(eq(coupons.code, code), ne(coupons.id, excludeId)) : eq(coupons.code, code);
  const [row] = await db.select({ id: coupons.id }).from(coupons).where(where).limit(1);
  return !!row;
}

export async function insertCoupon(tx: DbClient, values: typeof coupons.$inferInsert): Promise<number> {
  const [result] = await tx.insert(coupons).values(values);
  return result.insertId;
}

export async function updateCoupon(tx: DbClient, id: number, values: CouponUpdate): Promise<void> {
  await tx.update(coupons).set(values).where(eq(coupons.id, id));
}

export async function deleteCoupon(tx: DbClient, id: number): Promise<void> {
  await tx.delete(coupons).where(eq(coupons.id, id));
}

// ── Usage: always counted from `coupon_usages`, never read from `used_count` ────────────────────

export async function countUsagesByCouponIds(ids: number[]): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select({ couponId: couponUsages.couponId, count: count() }).from(couponUsages).where(inArray(couponUsages.couponId, ids)).groupBy(couponUsages.couponId);
  return new Map(rows.map((row) => [row.couponId, row.count]));
}

export async function countUsagesByCouponId(id: number, client: DbClient = db): Promise<number> {
  const [row] = await client.select({ count: count() }).from(couponUsages).where(eq(couponUsages.couponId, id));
  return row.count;
}

/**
 * Orders still pointing at the coupon through `orders.coupon_id` (a foreign key). A cancelled or
 * rejected order keeps that reference after its usage row is released, so a coupon with zero
 * usages can still be undeletable (DATABASE.md: rows referenced by orders are never hard-deleted).
 */
export async function countOrdersByCouponId(id: number, client: DbClient = db): Promise<number> {
  const [row] = await client.select({ count: count() }).from(orders).where(eq(orders.couponId, id));
  return row.count;
}

export type UsageRow = { createdAt: Date; orderNumber: string; paymentMethod: typeof orders.$inferSelect.paymentMethod };

/** The most recent usages with their order's number and method — the service decides whether the viewer may see the order numbers. */
export function listRecentUsages(couponId: number, limit: number): Promise<UsageRow[]> {
  return db
    .select({ createdAt: couponUsages.createdAt, orderNumber: orders.orderNumber, paymentMethod: orders.paymentMethod })
    .from(couponUsages)
    .innerJoin(orders, eq(orders.id, couponUsages.orderId))
    .where(eq(couponUsages.couponId, couponId))
    .orderBy(desc(couponUsages.createdAt), desc(couponUsages.id))
    .limit(limit);
}
