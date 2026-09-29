import { and, count, eq } from "drizzle-orm";
import { db, type DbClient } from "@/server/db/client";
import { couponUsages, coupons } from "@/server/db/schema/promotions";

export type CouponRow = typeof coupons.$inferSelect;

/**
 * `code` must already be normalised (trimmed, uppercase); codes are stored uppercase. With
 * `forUpdate`, the row is locked for the caller's transaction (createOrder, ARCHITECTURE.md §4.2).
 */
export async function getCouponByCode(code: string, dbc: DbClient = db, forUpdate = false): Promise<CouponRow | undefined> {
  const query = dbc.select().from(coupons).where(eq(coupons.code, code)).limit(1);
  const [row] = await (forUpdate ? query.for("update") : query);
  return row;
}

/** How many orders this customer (normalised phone) has already used the coupon on. */
export async function countCouponUsagesByCustomer(couponId: number, customerKey: string, dbc: DbClient = db): Promise<number> {
  const [row] = await dbc
    .select({ used: count() })
    .from(couponUsages)
    .where(and(eq(couponUsages.couponId, couponId), eq(couponUsages.customerKey, customerKey)));
  return row?.used ?? 0;
}
