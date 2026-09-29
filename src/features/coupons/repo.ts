import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { coupons } from "@/server/db/schema/promotions";

export type CouponRow = typeof coupons.$inferSelect;

/** `code` must already be normalised (trimmed, uppercase); codes are stored uppercase. */
export async function getCouponByCode(code: string): Promise<CouponRow | undefined> {
  const [row] = await db.select().from(coupons).where(eq(coupons.code, code)).limit(1);
  return row;
}
